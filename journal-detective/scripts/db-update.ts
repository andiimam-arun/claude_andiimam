/*
 * Pembaruan database rujukan (dijadwalkan mingguan lewat scripts/schedule-mac.sh, atau dijalankan manual).
 *   npm run db:update [-- --only doaj|scopus]
 * DOAJ: diunduh otomatis. Scopus: letakkan berkas .xlsx baru di data/inbox/scopus/ (mis. ext_list_Dec_2026.xlsx).
 * Kode keluar 1 bila ada yang GAGAL/DITOLAK; "tidak ada berkas"/"tidak berubah" bukan kegagalan.
 */
import { prisma } from "../src/lib/db";
import { runDatabaseUpdate, scopusInbox, type UpdateSource } from "../src/lib/services/dbUpdate";

async function main() {
  const i = process.argv.indexOf("--only");
  const only = i >= 0 ? [process.argv[i + 1].toUpperCase() as UpdateSource] : undefined;
  console.log(`[${new Date().toISOString()}] Pembaruan database dimulai (inbox Scopus: ${scopusInbox()})`);
  const res = await runDatabaseUpdate({ only });
  for (const r of res) console.log(`  ${r.source.padEnd(6)} ${r.outcome.padEnd(9)} ${r.detail}`);
  if (res.some((r) => r.outcome === "FAILED" || r.outcome === "REJECTED")) process.exitCode = 1;
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
