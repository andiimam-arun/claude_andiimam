import ExcelJS from "exceljs";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { prisma, STORAGE_DIR } from "../db";
import { classifyQuery, detectHeaderRow, detectSheetRole, mergeScopus, type MergedRecord, type MergeSummary, type ParsedSheet } from "../engine/scopusImport";
import { makeEvidence } from "../engine/evidence";
import { titleSimilarity } from "../engine/extract";
import { normalizeIssn } from "../engine/issn";
import { normalizeTitle, parseJson } from "../engine/util";
import type { EvidenceRecord, JournalIdentityInput } from "../engine/types";
import { audit, type Actor } from "./audit";

export class ScopusImportError extends Error {}
export const MAX_WORKBOOK_BYTES = 200 * 1024 * 1024;

export const importDir = () => path.resolve(STORAGE_DIR, "scopus-imports");

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const o = v as any;
  if (Array.isArray(o.richText)) return o.richText.map((t: any) => t.text).join("");
  if (o.result !== undefined) return cellToString(o.result);
  if (o.text !== undefined) return cellToString(o.text);
  if (o.hyperlink) return String(o.text ?? o.hyperlink);
  return String(v);
}

/**
 * Membaca workbook (semua sheet). Memakai pembaca NON-streaming ExcelJS: pembaca streaming terbukti tidak deterministik
 * (nama sheet kadang hilang/galat 'sheets' pada pemuatan berulang). Uji: 100.000 baris × 13 kolom ≈ 6 dtk, ±550 MB RSS.
 * Mengembalikan sheet yang dikenali + sheet yang diabaikan.
 */
export async function readWorkbook(filePath: string): Promise<{ sheets: ParsedSheet[]; ignored: MergeSummary["ignoredSheets"] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheets: ParsedSheet[] = [];
  const ignored: MergeSummary["ignoredSheets"] = [];
  for (const ws of wb.worksheets) {
    const name = ws.name;
    const all: Array<{ rowNumber: number; cells: string[] }> = [];
    ws.eachRow({ includeEmpty: false }, (row, number) => {
      const vals = (row.values as unknown[]).slice(1);
      all.push({ rowNumber: number, cells: Array.from({ length: vals.length }, (_, i) => cellToString(vals[i])) });
    });
    const det = detectHeaderRow(all.slice(0, 25).map((r) => r.cells));
    if (!det) { ignored.push({ name, reason: "Header tidak dikenali (tidak ada kolom judul + identifier)." }); continue; }
    const role = detectSheetRole(name, det.mapping);
    if (!role) { ignored.push({ name, reason: "Peran sheet tidak dikenali (bukan Sources/Discontinued/Accepted)." }); continue; }
    const rows = all.slice(det.rowIndex + 1).filter((r) => r.cells.some((c) => c.trim() !== ""));
    sheets.push({ name, role, headerRow: all[det.rowIndex].rowNumber, headers: det.headers.map((h) => h.trim()), mapping: det.mapping, rows });
  }
  return { sheets, ignored };
}

export interface StageInput { id?: string; filePath: string; fileName: string; versionLabel: string; observationDate: string; sourceUrl?: string | null; actor: Actor; isDemo?: boolean }

async function sha256File(p: string): Promise<string> {
  const h = createHash("sha256");
  await new Promise<void>((res, rej) => createReadStream(p).on("data", (d) => h.update(d)).on("end", () => res()).on("error", rej));
  return h.digest("hex");
}

/** Tahap PRATINJAU: parse + gabung, simpan hasil bertahap di disk. TIDAK menulis baris referensi dan TIDAK membuat Journal Passport. */
export async function stageImport(i: StageInput) {
  if (!i.versionLabel.trim()) throw new ScopusImportError("Label versi wajib diisi (mis. September 2026).");
  const obs = new Date(i.observationDate);
  if (isNaN(obs.getTime())) throw new ScopusImportError("Tanggal pengamatan data wajib diisi.");
  if (obs.getTime() > Date.now() + 86_400_000) throw new ScopusImportError("Tanggal pengamatan tidak boleh di masa depan.");
  if (i.sourceUrl && !/^https?:\/\//i.test(i.sourceUrl)) throw new ScopusImportError("URL asal harus diawali http(s)://");
  const size = statSync(i.filePath).size;
  if (size > MAX_WORKBOOK_BYTES) throw new ScopusImportError("Berkas terlalu besar.");
  const sha = await sha256File(i.filePath);
  let parsed;
  try { parsed = await readWorkbook(i.filePath); } catch (e: any) { throw new ScopusImportError(`Berkas tidak dapat dibaca sebagai workbook .xlsx (${String(e?.message ?? e).slice(0, 120)})`); }
  if (!parsed.sheets.some((s) => s.role === "SOURCES")) throw new ScopusImportError(`Sheet Scopus Sources tidak ditemukan. Sheet terdeteksi: ${[...parsed.sheets.map((s) => `${s.name} (${s.role})`), ...parsed.ignored.map((s) => `${s.name} (diabaikan)`)].join("; ") || "tidak ada"}.`);
  const { records, summary } = mergeScopus(parsed.sheets, parsed.ignored);
  if (summary.totals.sources === 0) throw new ScopusImportError("Tidak ada baris Sources yang valid.");
  const same = await prisma.scopusImport.findFirst({ where: { sha256: sha, status: { in: ["CONFIRMED", "SUPERSEDED"] } } });
  const id = i.id ?? randomUUID();
  mkdirSync(importDir(), { recursive: true, mode: 0o700 });
  const staged = path.join(importDir(), `${id}.records.json.gz`);
  writeFileSync(staged, gzipSync(JSON.stringify(records)), { mode: 0o600 });
  const row = await prisma.scopusImport.create({
    data: {
      id, versionLabel: i.versionLabel.trim(), observationDate: obs, sourceUrl: i.sourceUrl?.trim() || null, fileName: i.fileName, fileSize: size, sha256: sha, importedById: i.actor.id, importedByName: i.actor.name,
      status: "PREVIEW", isDemo: !!i.isDemo, stagedPath: staged, recordCount: records.length, summaryJson: JSON.stringify({ ...summary, identicalToImportId: same?.id ?? null }),
    },
  });
  await audit(i.actor, "SCOPUS_IMPORT_PREVIEWED", "ScopusImport", id, { file: i.fileName, sha256: sha, version: i.versionLabel, records: records.length, conflicts: summary.totals.conflicts, errors: summary.totals.errors });
  return row;
}

/** Konfirmasi: menyimpan baris, lalu BARU menjadikan impor ini 'terkini' (impor lama menjadi SUPERSEDED, tidak dihapus). */
export async function confirmImport(importId: string, actor: Actor) {
  const imp = await prisma.scopusImport.findUniqueOrThrow({ where: { id: importId } });
  if (imp.status !== "PREVIEW") throw new ScopusImportError("Hanya impor berstatus PRATINJAU yang dapat dikonfirmasi.");
  if (!imp.stagedPath || !existsSync(imp.stagedPath)) throw new ScopusImportError("Berkas bertahap hilang; ulangi unggah.");
  const records = JSON.parse(gunzipSync(readFileSync(imp.stagedPath)).toString("utf8")) as MergedRecord[];
  try {
    for (let k = 0; k < records.length; k += 1000) {
      await prisma.scopusSource.createMany({
        data: records.slice(k, k + 1000).map((r) => ({
          importId, sourceId: r.sourceId, title: r.title, normTitle: r.normTitle, issnRaw: r.issnRaw, eissnRaw: r.eissnRaw, issn: r.issn, eissn: r.eissn, status: r.status, activeRaw: r.activeRaw,
          coverage: r.coverage, coverageFrom: r.coverageFrom, coverageTo: r.coverageTo, discontinuedQuality: r.discontinuedQuality, discontinuedRaw: r.discontinuedRaw, sourceType: r.sourceType,
          publisher: r.publisher, publisherGroup: r.publisherGroup, publisherCountry: r.publisherCountry, asjc: r.asjc, openAccessRaw: r.openAccessRaw, origin: r.origin,
          discontinuedJson: r.discontinued ? JSON.stringify(r.discontinued) : null, acceptedJson: r.accepted ? JSON.stringify(r.accepted) : null, conflictsJson: JSON.stringify(r.conflicts), extraJson: JSON.stringify(r.extra),
        })),
      });
    }
    await prisma.$transaction([
      prisma.scopusImport.updateMany({ where: { isCurrent: true }, data: { isCurrent: false, status: "SUPERSEDED", supersededAt: new Date() } }),
      prisma.scopusImport.update({ where: { id: importId }, data: { status: "CONFIRMED", isCurrent: true, confirmedAt: new Date() } }),
    ]);
  } catch (e) {
    await prisma.scopusSource.deleteMany({ where: { importId } }); // hanya baris parsial milik impor ini
    await prisma.scopusImport.update({ where: { id: importId }, data: { status: "FAILED" } });
    throw new ScopusImportError(`Impor gagal dan dibatalkan (data lama tidak berubah): ${String((e as Error).message).slice(0, 160)}`);
  }
  await audit(actor, "SCOPUS_IMPORT_CONFIRMED", "ScopusImport", importId, { version: imp.versionLabel, records: records.length, sha256: imp.sha256 });
  return prisma.scopusImport.findUniqueOrThrow({ where: { id: importId } });
}

export async function cancelImport(importId: string, actor: Actor) {
  const imp = await prisma.scopusImport.findUniqueOrThrow({ where: { id: importId } });
  if (imp.status !== "PREVIEW") throw new ScopusImportError("Hanya pratinjau yang dapat dibatalkan.");
  await prisma.scopusImport.update({ where: { id: importId }, data: { status: "CANCELLED" } });
  for (const p of [imp.stagedPath, path.join(importDir(), `${importId}.xlsx`)]) if (p && existsSync(p)) await rm(p, { force: true });
  await audit(actor, "SCOPUS_IMPORT_CANCELLED", "ScopusImport", importId, {});
}

export const currentImport = () => prisma.scopusImport.findFirst({ where: { isCurrent: true, status: "CONFIRMED" } });

export interface SourceView {
  id: string; sourceId: string | null; title: string; issn: string | null; eissn: string | null; status: string; coverage: string | null; publisher: string | null; publisherGroup: string | null;
  sourceType: string | null; discontinuedQuality: boolean; hasConflicts: boolean; origin: string; asjc: string | null;
}
const fmt = (k: string | null) => (k ? `${k.slice(0, 4)}-${k.slice(4)}` : null);
export function toView(r: any): SourceView {
  return { id: r.id, sourceId: r.sourceId, title: r.title, issn: fmt(r.issn), eissn: fmt(r.eissn), status: r.status, coverage: r.coverage, publisher: r.publisher, publisherGroup: r.publisherGroup, sourceType: r.sourceType, discontinuedQuality: r.discontinuedQuality, hasConflicts: parseJson<any[]>(r.conflictsJson, []).length > 0, origin: r.origin, asjc: r.asjc };
}

/** Pencarian pada database referensi (impor terkini): nama (awalan/mengandung), ISSN dengan/tanpa tanda hubung pada KEDUA kolom, atau Source ID. */
export async function searchScopus(q: string, limit = 15) {
  const imp = await currentImport();
  if (!imp) return { import: null, kind: "NONE" as const, results: [] as SourceView[] };
  const { kind, value } = classifyQuery(q);
  if (!value || (kind === "TITLE" && value.length < 2)) return { import: imp, kind, results: [] as SourceView[] };
  let rows: any[] = [];
  if (kind === "ISSN") rows = await prisma.scopusSource.findMany({ where: { importId: imp.id, OR: [{ issn: value }, { eissn: value }] }, take: limit });
  else if (kind === "SOURCE_ID") rows = await prisma.scopusSource.findMany({ where: { importId: imp.id, sourceId: value }, take: limit });
  else {
    const [pre, con] = await Promise.all([
      prisma.scopusSource.findMany({ where: { importId: imp.id, normTitle: { startsWith: value } }, take: limit * 3 }),
      prisma.scopusSource.findMany({ where: { importId: imp.id, normTitle: { contains: value } }, take: limit * 3 }),
    ]);
    const seen = new Set<string>();
    rows = [...pre, ...con].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    const rank = (r: any) => (r.normTitle === value ? 0 : r.normTitle.startsWith(value) ? 1 : 2);
    rows.sort((a, b) => rank(a) - rank(b) || (a.status === "ACTIVE" ? 0 : 1) - (b.status === "ACTIVE" ? 0 : 1) || a.normTitle.length - b.normTitle.length);
    rows = rows.slice(0, limit);
  }
  return { import: imp, kind, results: rows.map(toView) };
}

export async function getSourceDetail(id: string) {
  const r = await prisma.scopusSource.findUnique({ where: { id }, include: { import: true } });
  if (!r) return null;
  return { ...r, discontinued: parseJson<any>(r.discontinuedJson, null), accepted: parseJson<any>(r.acceptedJson, null), conflicts: parseJson<any[]>(r.conflictsJson, []), extra: parseJson<Record<string, string>>(r.extraJson, {}) };
}

// ---------- integrasi dengan investigasi ----------
export async function lookupScopusImport(q: { issn?: string | null; eissn?: string | null; sourceId?: string | null; title?: string | null }) {
  const imp = await currentImport();
  if (!imp) return { import: null, matches: [] as any[], matchedBy: null as null | "IDENTIFIER" | "TITLE" };
  const keys = [q.issn, q.eissn].map((x) => normalizeIssn(x)?.replace("-", "")).filter(Boolean) as string[];
  const or: any[] = [];
  if (q.sourceId) or.push({ sourceId: q.sourceId });
  if (keys.length) or.push({ issn: { in: keys } }, { eissn: { in: keys } });
  if (or.length) {
    const m = await prisma.scopusSource.findMany({ where: { importId: imp.id, OR: or }, take: 5 });
    if (m.length) return { import: imp, matches: m, matchedBy: "IDENTIFIER" as const };
  }
  const nt = normalizeTitle(q.title);
  if (nt) {
    const m = await prisma.scopusSource.findMany({ where: { importId: imp.id, normTitle: nt }, take: 5 });
    if (m.length) return { import: imp, matches: m, matchedBy: "TITLE" as const };
  }
  return { import: imp, matches: [], matchedBy: null };
}

export const importLabel = (imp: { versionLabel: string }) => `impor Scopus ${imp.versionLabel}`;

/** Bukti dari impor Scopus. Selalu berlabel IMPORTED_DATA + versi + tanggal pengamatan; 'tidak ditemukan' = belum terverifikasi. */
export function scopusImportEvidence(identity: JournalIdentityInput, si: Awaited<ReturnType<typeof lookupScopusImport>>): EvidenceRecord[] {
  const imp = si.import!;
  const out: EvidenceRecord[] = [];
  const src = {
    sourceName: `Impor Scopus Source List — ${imp.versionLabel}${imp.isDemo ? " [DATA DEMONSTRASI FIKTIF]" : ""}`,
    sourceRef: `${imp.fileName} (sha256 ${imp.sha256.slice(0, 12)}…)${imp.sourceUrl ? ` ← ${imp.sourceUrl}` : " ← unggah manual"}`,
    sourceDataDate: imp.observationDate.toISOString(), integration: "IMPORTED_DATA" as const,
  };
  if (!si.matches.length) {
    out.push(makeEvidence({
      check: "SCOPUS", key: "scopus.coverage", status: "NOT_FOUND", ...src,
      finding: `Tidak ditemukan dalam ${importLabel(imp)} — BELUM TERVERIFIKASI (bukan berarti tidak terindeks).`,
      explanation: "Ketiadaan pada impor historis bukan bukti negatif: jurnal dapat ditambahkan setelah tanggal data, atau identifier berbeda. Verifikasi manual pada Scopus Sources diperlukan.",
      severity: "LOW", strength: "WEAK", data: { conclusive: false, importId: imp.id }, fingerprintSeed: `scopus-imp-nf|${imp.id}|${normalizeTitle(identity.title)}`,
    }));
    return out;
  }
  const weak = si.matchedBy === "TITLE";
  for (const m of si.matches.slice(0, 3)) {
    const conflicts = parseJson<any[]>(m.conflictsJson, []);
    const disc = parseJson<any>(m.discontinuedJson, null);
    const coverage = m.status === "ACTIVE" ? "ACTIVE" : m.status === "INACTIVE" ? "DISCONTINUED" : m.status === "ACCEPTED" ? "ACCEPTED_PENDING" : null;
    const statusText = m.status === "ACTIVE" ? "Active" : m.status === "INACTIVE" ? `Inactive (tidak lagi diindeks${m.discontinuedQuality ? "; ditandai dihentikan karena masalah kualitas" : "; TIDAK ditandai karena masalah kualitas"})` : m.status === "ACCEPTED" ? "Diterima untuk ditambahkan (BELUM otomatis aktif terindeks)" : "status tidak jelas";
    const finalCov = disc ? { year: disc.finalYear ?? null, volume: disc.finalVolume ?? null, issue: disc.finalIssue ?? null, pages: disc.finalPages ?? null, indexationChange: disc.indexationChange ?? null } : null;
    out.push(makeEvidence({
      check: "SCOPUS", key: "scopus.coverage", ...src,
      finding: `Berdasarkan ${importLabel(imp)} (data historis, bukan verifikasi langsung): "${m.title}" — ${statusText}${m.coverage ? `, coverage ${m.coverage}` : ""}.${conflicts.length ? ` Terdapat ${conflicts.length} konflik data untuk ditinjau.` : ""}`,
      status: conflicts.length ? "CONFLICTED" : weak || !coverage ? "REPORTED_UNVERIFIED" : "VERIFIED",
      extracted: JSON.stringify({ sourceId: m.sourceId, title: m.title, issn: fmt(m.issn), eissn: fmt(m.eissn), status: m.status, coverage: m.coverage, publisher: m.publisher, publisherGroup: m.publisherGroup, sourceType: m.sourceType, asjc: m.asjc, discontinuedForQuality: m.discontinuedQuality, finalCoverage: finalCov, conflicts: conflicts.map((c) => c.type) }),
      explanation: `Active/Inactive menurut berkas impor ${imp.versionLabel}; Inactive TIDAK otomatis berarti dihentikan karena kualitas. Status Accepted = diterima untuk proses penambahan. Bukti ini tidak membuktikan situs pengiriman autentik maupun klirens akhir.${weak ? " Kecocokan hanya pada judul sehingga perlu konfirmasi manusia." : ""}`,
      severity: conflicts.length ? "MEDIUM" : "INFO", strength: weak ? "WEAK" : "MODERATE", requiresHumanConfirmation: weak || !!conflicts.length || !coverage,
      data: { coverage, coverageFrom: m.coverageFrom, coverageTo: finalCov?.year ?? m.coverageTo, sourceId: m.sourceId, publisher: m.publisher, publisherGroup: m.publisherGroup, discontinuedForQuality: m.discontinuedQuality, finalCoverage: finalCov, conflictTypes: conflicts.map((c) => c.type), importId: imp.id, importVersion: imp.versionLabel, matchedBy: si.matchedBy, origin: m.origin, title: m.title },
      fingerprintSeed: `scopus-imp|${imp.id}|${m.id}`,
    }));
  }
  const best = si.matches[0];
  if (si.matchedBy === "IDENTIFIER") {
    if (titleSimilarity(best.title, identity.title) < 0.6 && !identity.altTitles.some((a) => titleSimilarity(best.title, a) >= 0.6)) {
      out.push(makeEvidence({ check: "IDENTITY", key: "identity.title_mismatch", status: "CONFLICTED", ...src, finding: `Identifier cocok dengan "${best.title}" pada ${importLabel(imp)}, tetapi judul yang diajukan "${identity.title}" berbeda.`, severity: "MEDIUM", requiresHumanConfirmation: true, explanation: "Bisa perubahan judul sah, kesalahan input, atau pemakaian identifier jurnal lain.", data: { scopusTitle: best.title }, fingerprintSeed: `imp-title|${best.id}|${normalizeTitle(identity.title)}` }));
    } else {
      out.push(makeEvidence({ check: "IDENTITY", key: "identity.corroboration", status: "VERIFIED", ...src, finding: `Identitas dicocokkan lewat identifier (Source ID/ISSN/E-ISSN) dengan "${best.title}" pada ${importLabel(imp)}.`, strength: "MODERATE", explanation: "Kecocokan identifier + judul pada sumber rujukan yang diimpor.", data: { via: "SCOPUS_IMPORT" }, fingerprintSeed: `imp-corr|${best.id}` }));
    }
    if (identity.publisher && best.publisher && titleSimilarity(best.publisher, identity.publisher) < 0.4 && titleSimilarity(best.publisherGroup ?? "", identity.publisher) < 0.4) {
      out.push(makeEvidence({ check: "IDENTITY", key: "identity.publisher_mismatch", status: "CONFLICTED", ...src, finding: `Penerbit yang diajukan ("${identity.publisher}") berbeda dari catatan Scopus ("${best.publisher}"${best.publisherGroup ? `; grup: ${best.publisherGroup}` : ""}).`, severity: "MEDIUM", requiresHumanConfirmation: true, explanation: "Dapat akibat pergantian penerbit atau penulisan berbeda; perlu verifikasi.", fingerprintSeed: `imp-pub|${best.id}|${normalizeTitle(identity.publisher)}` }));
    }
  }
  return out;
}
