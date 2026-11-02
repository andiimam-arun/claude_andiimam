import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { getMode } from "../mode";

/**
 * Cadangan & pemulihan SQLite + folder dokumen. Cadangan memuat DATA RAHASIA: simpan pada volume terenkripsi, akses terbatas.
 * Pemulihan TIDAK menimpa apa pun tanpa --overwrite eksplisit dan memverifikasi integritas (sha256) sebelum & sesudah.
 */

const sha = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

export function sqlitePath(dbUrl: string, baseDir = path.resolve("prisma")): string {
  if (!dbUrl.startsWith("file:")) throw new Error("Cadangan otomatis hanya untuk SQLite (file:). Untuk PostgreSQL gunakan pg_dump (lihat docs/PILOT_RUNBOOK.md).");
  const p = dbUrl.replace(/^file:/, "");
  return path.isAbsolute(p) ? p : path.resolve(baseDir, p);
}

function walk(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const full = path.join(dir, f);
    return statSync(full).isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });
}

export interface Manifest {
  createdAt: string; mode: string; dbFile: string; dbSha256: string; counts: Record<string, number>;
  files: Array<{ path: string; sha256: string; size: number }>; documents: Array<{ id: string; storagePath: string; sha256: string }>;
}

async function countsOf(c: PrismaClient) {
  const [users, journals, applications, assessments, evidence, documents, findings, validationCases, letters, auditLogs] = await Promise.all([
    c.user.count(), c.journal.count(), c.application.count(), c.assessment.count(), c.evidence.count(), c.document.count(), c.destinationFinding.count(), c.validationCase.count(), c.letter.count(), c.auditLog.count(),
  ]);
  return { users, journals, applications, assessments, evidence, documents, findings, validationCases, letters, auditLogs };
}

export async function createBackup(opts: { outDir: string; storageDir: string }): Promise<Manifest> {
  const out = path.resolve(opts.outDir);
  if (existsSync(out) && readdirSync(out).length) throw new Error(`Folder cadangan sudah berisi data: ${out}. Gunakan folder baru (tidak menimpa).`);
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const dbFile = path.join(out, "database.sqlite");
  if (/['"\;]/.test(dbFile)) throw new Error("Jalur cadangan tidak aman.");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${dbFile}'`); // salinan konsisten (online)
  chmodSync(dbFile, 0o600);
  const storageSrc = path.resolve(opts.storageDir);
  const storageOut = path.join(out, "storage");
  if (existsSync(storageSrc)) cpSync(storageSrc, storageOut, { recursive: true });
  else mkdirSync(storageOut);
  const files = walk(storageOut).map((rel) => { const b = readFileSync(path.join(storageOut, rel)); return { path: rel, sha256: sha(b), size: b.length }; });
  const docs = await prisma.document.findMany({ select: { id: true, storagePath: true, sha256: true } });
  const manifest: Manifest = { createdAt: new Date().toISOString(), mode: getMode(), dbFile: "database.sqlite", dbSha256: sha(readFileSync(dbFile)), counts: await countsOf(prisma as unknown as PrismaClient), files, documents: docs };
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return manifest;
}

export interface RestoreReport { ok: boolean; problems: string[]; counts: Record<string, number>; documentsChecked: number }

export async function restoreBackup(opts: { backupDir: string; targetDb: string; targetStorage: string; overwrite?: boolean }): Promise<RestoreReport> {
  const dir = path.resolve(opts.backupDir);
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  const problems: string[] = [];
  // 1. verifikasi cadangan SEBELUM menyalin
  if (sha(readFileSync(path.join(dir, manifest.dbFile))) !== manifest.dbSha256) problems.push("sha256 basis data cadangan tidak cocok (cadangan rusak/diubah).");
  for (const f of manifest.files) {
    const p = path.join(dir, "storage", f.path);
    if (!existsSync(p) || sha(readFileSync(p)) !== f.sha256) problems.push(`Berkas cadangan rusak/hilang: ${f.path}`);
  }
  if (problems.length) return { ok: false, problems, counts: {}, documentsChecked: 0 };
  // 2. tolak menimpa tanpa --overwrite
  const tdb = path.resolve(opts.targetDb), tst = path.resolve(opts.targetStorage);
  if (!opts.overwrite) {
    if (existsSync(tdb)) throw new Error(`Target basis data sudah ada: ${tdb}. Pulihkan ke jalur baru, atau gunakan --overwrite secara sadar.`);
    if (existsSync(tst) && readdirSync(tst).length) throw new Error(`Target folder dokumen tidak kosong: ${tst}. Gunakan jalur baru atau --overwrite.`);
  }
  mkdirSync(path.dirname(tdb), { recursive: true });
  copyFileSync(path.join(dir, manifest.dbFile), tdb);
  chmodSync(tdb, 0o600);
  mkdirSync(tst, { recursive: true, mode: 0o700 });
  if (existsSync(path.join(dir, "storage"))) cpSync(path.join(dir, "storage"), tst, { recursive: true });
  // 3. verifikasi hasil pemulihan: jumlah baris & integritas setiap dokumen terhadap sha256 tercatat
  const c = new PrismaClient({ datasources: { db: { url: `file:${tdb}` } } });
  try {
    const counts = await countsOf(c);
    for (const [k, n] of Object.entries(manifest.counts)) if (counts[k as keyof typeof counts] !== n) problems.push(`Jumlah ${k} berbeda: cadangan ${n}, pulihan ${counts[k as keyof typeof counts]}`);
    const docs = await c.document.findMany({ select: { id: true, storagePath: true, sha256: true } });
    for (const d of docs) {
      const p = path.join(tst, d.storagePath);
      if (!existsSync(p)) problems.push(`Dokumen hilang setelah pemulihan: ${d.id}`);
      else if (sha(readFileSync(p)) !== d.sha256) problems.push(`Integritas dokumen gagal (sha256): ${d.id}`);
    }
    return { ok: problems.length === 0, problems, counts, documentsChecked: docs.length };
  } finally { await c.$disconnect(); }
}
