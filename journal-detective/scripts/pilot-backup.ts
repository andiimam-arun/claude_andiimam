/* Cadangan pilot: basis data (VACUUM INTO) + folder dokumen + manifest sha256. Lihat docs/PILOT_RUNBOOK.md */
import path from "node:path";
import { createBackup } from "../src/lib/ops/backup";
import { prisma } from "../src/lib/db";

async function main() {
  const out = process.argv[2] ?? path.join("backups", new Date().toISOString().replace(/[:.]/g, "-"));
  const m = await createBackup({ outDir: out, storageDir: process.env.STORAGE_DIR || "./storage" });
  console.log(`Cadangan selesai: ${path.resolve(out)}`);
  console.log(`  baris: ${JSON.stringify(m.counts)}; berkas dokumen: ${m.files.length}; sha256 DB: ${m.dbSha256.slice(0, 16)}…`);
  console.log("PERINGATAN: cadangan berisi data rahasia. Simpan di volume terenkripsi dengan akses terbatas.");
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
