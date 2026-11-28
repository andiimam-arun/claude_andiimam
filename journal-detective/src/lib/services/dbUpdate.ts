import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { Agent, EnvHttpProxyAgent, fetch as ufetch } from "undici";
import { prisma } from "../db";
import { audit, type Actor } from "./audit";
import { importDataset } from "./reference";
import { cancelImport, confirmImport, currentImport, stageImport } from "./scopusReference";

/**
 * Pembaruan database rujukan secara berkala tanpa formulir.
 *  - DOAJ: CSV publik diunduh otomatis dari host tetap doaj.org.
 *  - Scopus: berkas .xlsx baru diletakkan di folder inbox; versi/tanggal dibaca dari nama berkas.
 * Pengaman: berkas identik dilewati, penurunan jumlah baris > 20% ditolak, data lama tetap aktif bila gagal.
 * SCImago tidak diotomatisasi (situsnya memakai tantangan anti-bot; tidak dilewati). Impor manual tetap tersedia.
 */
export type UpdateSource = "DOAJ" | "SCOPUS";
export type UpdateOutcome = "UPDATED" | "UNCHANGED" | "NO_FILE" | "REJECTED" | "FAILED";
export interface UpdateResult { source: UpdateSource; outcome: UpdateOutcome; detail: string; version?: string }

export const STALE_DAYS: Record<UpdateSource, number> = { DOAJ: 30, SCOPUS: 120 };
export const MAX_DROP = 0.2;
export const DOAJ_CSV_URL = "https://doaj.org/csv";
export const scopusInbox = () => process.env.INBOX_DIR ? path.resolve(process.env.INBOX_DIR, "scopus") : path.resolve("data", "inbox", "scopus");

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const ID_MONTH = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "ext_list_Sep_2026.xlsx" → { label: "September 2026", date: "2026-09-01" }; null bila tidak terbaca. */
export function parseScopusFileName(name: string): { label: string; date: string } | null {
  const m = name.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s._-]*(20\d\d)/i);
  if (!m) return null;
  const idx = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase()));
  if (idx < 0) return null;
  return { label: `${ID_MONTH[idx]} ${m[2]}`, date: `${m[2]}-${String(idx + 1).padStart(2, "0")}-01` };
}

async function downloadDoaj(maxBytes = 80 * 1024 * 1024): Promise<Buffer> {
  const proxied = !!(process.env.HTTPS_PROXY || process.env.https_proxy);
  const dispatcher = proxied ? new EnvHttpProxyAgent() : new Agent();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 180_000); // setTimeout (bukan AbortSignal.timeout): timer harus menahan event loop pada skrip CLI
  try {
    const r = await ufetch(DOAJ_CSV_URL, { dispatcher, redirect: "follow", signal: ctl.signal, headers: { "user-agent": "journal-assessment-db-update" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // doaj.org/csv dialihkan ke bucket S3 milik DOAJ (tautan bertanda tangan); host lain ditolak.
    const fin = new URL(r.url);
    if (fin.protocol !== "https:" || !(fin.hostname === "doaj.org" || /^doaj[a-z0-9-]*\.s3(\.[a-z0-9-]+)?\.amazonaws\.com$/.test(fin.hostname))) { await r.body?.cancel(); throw new Error(`pengalihan ke host tidak dikenal ditolak (${fin.hostname})`); }
    const chunks: Uint8Array[] = []; let total = 0;
    const reader = r.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { await reader.cancel(); throw new Error("berkas terlalu besar"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); await dispatcher.destroy().catch(() => undefined); }
}

async function record(source: UpdateSource, res: UpdateResult) {
  const key = `dbupdate:${source}`;
  const prev = await prisma.setting.findUnique({ where: { key } });
  const old = prev ? JSON.parse(prev.valueJson) : {};
  const now = new Date().toISOString();
  const v = { ...old, checkedAt: now, outcome: res.outcome, detail: res.detail, ...(res.outcome === "UPDATED" ? { lastUpdatedAt: now, version: res.version } : {}) };
  await prisma.setting.upsert({ where: { key }, create: { key, valueJson: JSON.stringify(v) }, update: { valueJson: JSON.stringify(v) } });
}

export async function updateDoaj(actor: Actor): Promise<UpdateResult> {
  let buf: Buffer;
  try { buf = await downloadDoaj(); } catch (e: any) {
    return { source: "DOAJ", outcome: "FAILED", detail: `Unduhan gagal (${String(e?.cause?.code ?? e?.message ?? e).slice(0, 100)}). Data lama tetap dipakai.` };
  }
  if (!buf.subarray(0, 200).toString("utf8").replace(/^﻿/, "").startsWith("Journal title")) return { source: "DOAJ", outcome: "REJECTED", detail: "Isi unduhan bukan CSV DOAJ yang dikenali. Data lama tetap aktif." };
  const sha = createHash("sha256").update(buf).digest("hex");
  const same = await prisma.referenceDataset.findFirst({ where: { kind: "DOAJ_LIST", active: true, sha256: sha } });
  if (same) return { source: "DOAJ", outcome: "UNCHANGED", detail: `Tidak ada perubahan sejak "${same.versionLabel}".`, version: same.versionLabel };
  const today = new Date().toISOString().slice(0, 10);
  try {
    const ds = await importDataset({
      kind: "DOAJ_LIST", buffer: buf, filename: `doaj-${today}.csv`, versionLabel: `DOAJ CSV ${today}`, sourceDate: new Date(), isComplete: true, maxDropRatio: MAX_DROP,
      provenance: `Pembaruan otomatis dari ${DOAJ_CSV_URL} (data terbuka DOAJ), ${today}.`, actor,
    });
    return { source: "DOAJ", outcome: "UPDATED", detail: `${ds.rowCount} jurnal.`, version: ds.versionLabel };
  } catch (e: any) { return { source: "DOAJ", outcome: "REJECTED", detail: String(e?.message ?? e).slice(0, 220) }; }
}

function moveTo(file: string, sub: "processed" | "rejected") {
  const dir = path.join(path.dirname(file), sub);
  mkdirSync(dir, { recursive: true });
  renameSync(file, path.join(dir, `${new Date().toISOString().slice(0, 10)}-${path.basename(file)}`));
}

export async function updateScopusFromInbox(actor: Actor): Promise<UpdateResult[]> {
  const dir = scopusInbox();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const files = readdirSync(dir).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$")).map((f) => path.join(dir, f)).filter((f) => statSync(f).isFile()).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  if (!files.length) return [{ source: "SCOPUS", outcome: "NO_FILE", detail: `Tidak ada berkas baru di ${dir}.` }];
  const out: UpdateResult[] = [];
  for (const f of files) {
    const name = path.basename(f);
    const meta = parseScopusFileName(name);
    if (!meta) { out.push({ source: "SCOPUS", outcome: "REJECTED", detail: `${name}: bulan/tahun tidak terbaca dari nama berkas (contoh nama: ext_list_Sep_2026.xlsx). Berkas dibiarkan di tempat.` }); continue; }
    try {
      const cur = await currentImport();
      if (cur && new Date(meta.date) < cur.observationDate) { moveTo(f, "rejected"); out.push({ source: "SCOPUS", outcome: "REJECTED", detail: `${name}: lebih lama (${meta.label}) daripada data aktif (${cur.versionLabel}). Dipindahkan ke rejected/.` }); continue; }
      const imp = await stageImport({ filePath: f, fileName: name, versionLabel: meta.label, observationDate: meta.date, actor });
      const sum = JSON.parse(imp.summaryJson);
      if (sum.identicalToImportId) { await cancelImport(imp.id, actor); moveTo(f, "processed"); out.push({ source: "SCOPUS", outcome: "UNCHANGED", detail: `${name}: identik dengan impor sebelumnya.`, version: meta.label }); continue; }
      const badRatio = sum.totals.records ? sum.totals.errors / sum.totals.records : 1;
      if (badRatio > 0.05 || (cur && imp.recordCount < cur.recordCount * (1 - MAX_DROP))) {
        await cancelImport(imp.id, actor); moveTo(f, "rejected");
        out.push({ source: "SCOPUS", outcome: "REJECTED", detail: `${name}: ditolak (${imp.recordCount} record vs ${cur?.recordCount ?? 0} aktif; galat ${sum.totals.errors}). Data lama tetap aktif; berkas dipindahkan ke rejected/.` });
        continue;
      }
      await confirmImport(imp.id, actor);
      moveTo(f, "processed");
      out.push({ source: "SCOPUS", outcome: "UPDATED", detail: `${name}: ${imp.recordCount} record; konflik untuk ditinjau: ${sum.totals.conflicts}.`, version: meta.label });
    } catch (e: any) { out.push({ source: "SCOPUS", outcome: "FAILED", detail: `${name}: ${String(e?.message ?? e).slice(0, 200)}` }); }
  }
  return out;
}

export async function pickSystemActor(): Promise<Actor | null> {
  const u = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "HEAD"] }, active: true }, orderBy: { createdAt: "asc" } });
  return u ? { id: u.id, name: u.name, role: u.role } : null;
}

export async function runDatabaseUpdate(opts: { only?: UpdateSource[]; actor?: Actor } = {}): Promise<UpdateResult[]> {
  const actor = opts.actor ?? (await pickSystemActor());
  if (!actor) throw new Error("Tidak ada pengguna ADMIN/HEAD aktif untuk mencatat pembaruan.");
  const want = opts.only ?? ["DOAJ", "SCOPUS"];
  const results: UpdateResult[] = [];
  if (want.includes("DOAJ")) { const r = await updateDoaj(actor); await record("DOAJ", r); results.push(r); }
  if (want.includes("SCOPUS")) {
    const rs = await updateScopusFromInbox(actor);
    // Satu catatan per proses: hasil paling bermakna (UPDATED > REJECTED/FAILED > UNCHANGED > NO_FILE).
    const order: UpdateOutcome[] = ["UPDATED", "FAILED", "REJECTED", "UNCHANGED", "NO_FILE"];
    for (const r of rs) results.push(r);
    const best = [...rs].sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome))[0];
    await record("SCOPUS", best);
  }
  await audit(actor, "DB_UPDATE_RUN", "ReferenceDataset", null, { results });
  return results;
}

export interface SourceFreshness { source: UpdateSource; label: string; dataDate: Date | null; version: string | null; ageDays: number | null; thresholdDays: number; state: "OK" | "STALE" | "NEVER"; checkedAt: string | null; lastOutcome: UpdateOutcome | null; lastDetail: string | null }

export async function updateStatus(): Promise<SourceFreshness[]> {
  const rows: SourceFreshness[] = [];
  const doaj = await prisma.referenceDataset.findFirst({ where: { kind: "DOAJ_LIST", active: true }, orderBy: { importedAt: "desc" } });
  const sc = await currentImport();
  const get = async (s: UpdateSource) => { const r = await prisma.setting.findUnique({ where: { key: `dbupdate:${s}` } }); return r ? JSON.parse(r.valueJson) : {}; };
  for (const [source, label, date, version] of [
    ["DOAJ", "DOAJ (CSV)", doaj?.sourceDate ?? null, doaj?.versionLabel ?? null],
    ["SCOPUS", "Scopus Source List", sc?.observationDate ?? null, sc?.versionLabel ?? null],
  ] as Array<[UpdateSource, string, Date | null, string | null]>) {
    const st = await get(source);
    const age = date ? Math.floor((Date.now() - date.getTime()) / 86_400_000) : null;
    rows.push({ source, label, dataDate: date, version, ageDays: age, thresholdDays: STALE_DAYS[source], state: age === null ? "NEVER" : age > STALE_DAYS[source] ? "STALE" : "OK", checkedAt: st.checkedAt ?? null, lastOutcome: st.outcome ?? null, lastDetail: st.detail ?? null });
  }
  return rows;
}
