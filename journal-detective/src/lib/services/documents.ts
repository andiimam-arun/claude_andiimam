import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { prisma, STORAGE_DIR } from "../db";
import { validateUpload } from "../security/upload";
import { stripControl } from "../security/sanitize";
import { extractFields, type ExtractedFields } from "../engine/extract";
import { DOC_TYPES, type DocType } from "../engine/types";
import { parseJson } from "../engine/util";
import { audit, type Actor } from "./audit";
import { refreshFlags } from "./applications";
import { getActivePolicy } from "./policyService";

const MAX_TEXT = 200_000;

async function extractText(buf: Buffer, ext: string): Promise<{ text: string | null; note: string }> {
  try {
    if (ext === "pdf") {
      const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const r = await Promise.race([
        pdf(buf, { max: 30 }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("waktu ekstraksi habis")), 15000)),
      ]);
      const t = stripControl(r.text ?? "").trim();
      return t.length > 20 ? { text: t.slice(0, MAX_TEXT), note: `Teks diekstrak otomatis dari ${r.numpages} halaman PDF.` } : { text: null, note: "PDF tidak memuat teks yang dapat diekstrak (kemungkinan hasil pindai). Isi kolom secara manual." };
    }
    if (ext === "txt" || ext === "eml") return { text: stripControl(buf.toString("utf8")).slice(0, MAX_TEXT), note: "Teks dibaca langsung dari berkas." };
    if (ext === "png" || ext === "jpg" || ext === "jpeg") return { text: null, note: "Gambar: OCR belum dikonfigurasi. Peninjau memeriksa gambar asli dan mengisi kolom secara manual." };
    return { text: null, note: "Ekstraksi otomatis untuk format ini belum tersedia. Periksa dokumen asli." };
  } catch (e: any) {
    return { text: null, note: `Ekstraksi gagal (${String(e?.message ?? e).slice(0, 80)}). Periksa dokumen asli.` };
  }
}

export async function uploadDocument(opts: { applicationId: string; docType: DocType; filename: string; data: Buffer; actor: Actor }) {
  if (!DOC_TYPES.includes(opts.docType)) throw new Error("Jenis dokumen tidak valid");
  const v = validateUpload(opts.filename, opts.data.length, opts.data.subarray(0, 4096));
  if (!v.ok) throw new Error(v.error);
  const id = randomUUID();
  const rel = path.join(opts.applicationId, `${id}.${v.type.ext}`);
  const abs = path.resolve(STORAGE_DIR, rel);
  if (!abs.startsWith(path.resolve(STORAGE_DIR) + path.sep)) throw new Error("Jalur penyimpanan tidak valid");
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, opts.data, { mode: 0o600 });
  const { text, note } = await extractText(opts.data, v.type.ext);
  const fields = text ? extractFields(text) : { issns: [], dois: [], emails: [], domains: [], urls: [], dates: [], amounts: [], bankAccounts: [] };
  const doc = await prisma.document.create({
    data: {
      id, applicationId: opts.applicationId, docType: opts.docType, filename: v.safeName, mime: v.type.mime, size: opts.data.length, storagePath: rel,
      sha256: createHash("sha256").update(opts.data).digest("hex"), extractedText: text, extractionNote: note, fieldsJson: JSON.stringify(fields), uploadedById: opts.actor.id,
    },
  });
  await prisma.checklistItem.upsert({
    where: { applicationId_docType: { applicationId: opts.applicationId, docType: opts.docType } },
    create: { applicationId: opts.applicationId, docType: opts.docType, status: "UNVERIFIED" }, update: {},
  });
  await audit(opts.actor, "DOCUMENT_UPLOADED", "Document", doc.id, { applicationId: opts.applicationId, docType: opts.docType, size: doc.size, sha256: doc.sha256 });
  await refreshFlags(opts.applicationId);
  return doc;
}

export async function readDocumentBytes(docId: string) {
  const d = await prisma.document.findUnique({ where: { id: docId }, include: { application: true } });
  if (!d) return null;
  const abs = path.resolve(STORAGE_DIR, d.storagePath);
  if (!abs.startsWith(path.resolve(STORAGE_DIR) + path.sep)) return null;
  return { doc: d, bytes: await readFile(abs) };
}

export async function saveDocumentFields(docId: string, fields: Partial<ExtractedFields>, actor: Actor) {
  const d = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
  const merged = { ...parseJson<ExtractedFields>(d.fieldsJson, {} as ExtractedFields), ...fields };
  await prisma.document.update({ where: { id: docId }, data: { fieldsJson: JSON.stringify(merged), fieldsReviewed: true, reviewedById: actor.id } });
  await audit(actor, "DOCUMENT_FIELDS_REVIEWED", "Document", docId, { applicationId: d.applicationId });
  await refreshFlags(d.applicationId);
}

export async function purgeApplicationDocuments(applicationId: string, actor: Actor, reason: string) {
  // Kontrol retensi/penghapusan: hapus berkas fisik + catatan; jejak audit dipertahankan.
  const { rm } = await import("node:fs/promises");
  const docs = await prisma.document.findMany({ where: { applicationId } });
  for (const d of docs) await rm(path.resolve(STORAGE_DIR, d.storagePath), { force: true });
  await prisma.document.deleteMany({ where: { applicationId } });
  const p = await getActivePolicy();
  await audit(actor, "DOCUMENTS_PURGED", "Application", applicationId, { count: docs.length, reason }, p.version);
  await refreshFlags(applicationId);
}
