import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, openSync, readSync, closeSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getSession } from "@/lib/auth/session";
import { importDir, MAX_WORKBOOK_BYTES, ScopusImportError, stageImport } from "@/lib/services/scopusReference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const back = (req: Request, qs: Record<string, string>) => {
  const u = new URL("/sources/scopus", req.url);
  for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
  return NextResponse.redirect(u, 303);
};

/** Tahap 1 impor: unggah workbook → simpan terlindungi → pratinjau. TIDAK menulis database referensi dan TIDAK membuat Journal Passport. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !["ADMIN", "HEAD"].includes(s.role)) return new NextResponse("Forbidden", { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return new NextResponse("Forbidden", { status: 403 });
  const id = randomUUID();
  const dest = path.join(importDir(), `${id}.xlsx`);
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File) || f.size === 0) return back(req, { error: "Pilih berkas workbook .xlsx." });
    if (!/\.xlsx$/i.test(f.name)) return back(req, { error: "Berkas harus berformat .xlsx (workbook Excel)." });
    if (f.size > MAX_WORKBOOK_BYTES) return back(req, { error: "Berkas terlalu besar (maks 200 MB)." });
    mkdirSync(importDir(), { recursive: true, mode: 0o700 });
    await pipeline(Readable.fromWeb(f.stream() as any), createWriteStream(dest, { mode: 0o600 }));
    const fd = openSync(dest, "r"); const head = Buffer.alloc(4); readSync(fd, head, 0, 4, 0); closeSync(fd);
    if (head[0] !== 0x50 || head[1] !== 0x4b) { await rm(dest, { force: true }); return back(req, { error: "Isi berkas bukan workbook .xlsx yang valid." }); }
    const row = await stageImport({
      id, filePath: dest, fileName: f.name.replace(/[^\w.\- ()]+/g, "_").slice(-150), versionLabel: String(form.get("versionLabel") ?? ""), observationDate: String(form.get("observationDate") ?? ""),
      sourceUrl: String(form.get("sourceUrl") ?? "").trim() || null, actor: s,
    });
    return back(req, { preview: row.id });
  } catch (e) {
    await rm(dest, { force: true }).catch(() => undefined);
    return back(req, { error: e instanceof ScopusImportError ? e.message : `Gagal memproses berkas: ${String((e as Error)?.message ?? e).slice(0, 160)}` });
  }
}
