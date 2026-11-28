/* Pemulihan: node-tsx scripts/pilot-restore.ts <folder-cadangan> <target.db> <target-storage> [--overwrite] */
import { restoreBackup } from "../src/lib/ops/backup";

async function main() {
  const [dir, db, st, ...flags] = process.argv.slice(2);
  if (!dir || !db || !st) { console.error("Pemakaian: pilot:restore -- <folder-cadangan> <target-db-path> <target-storage-dir> [--overwrite]"); process.exit(2); }
  const r = await restoreBackup({ backupDir: dir, targetDb: db, targetStorage: st, overwrite: flags.includes("--overwrite") });
  console.log(r.ok ? `PEMULIHAN BERHASIL & TERVERIFIKASI. Baris: ${JSON.stringify(r.counts)}; dokumen diperiksa: ${r.documentsChecked}` : "PEMULIHAN GAGAL:\n - " + r.problems.join("\n - "));
  process.exitCode = r.ok ? 0 : 1;
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
