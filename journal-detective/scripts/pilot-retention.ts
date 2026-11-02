/* Retensi: daftar dokumen kedaluwarsa (dry-run). --execute menghapus permanen (tindakan eksplisit). */
import { findExpiredDocuments, getRetention, purgeExpired } from "../src/lib/ops/retention";
import { prisma } from "../src/lib/db";

async function main() {
  const days = Number(process.argv.find((a) => /^\d+$/.test(a))) || (await getRetention()).documentRetentionDays;
  if (!days) { console.log("Masa retensi belum ditetapkan (Pengaturan → Retensi, atau berikan jumlah hari sebagai argumen)."); return; }
  const apps = await findExpiredDocuments(days);
  console.log(`${apps.length} permohonan final dengan dokumen melewati ${days} hari:`);
  for (const a of apps) console.log(`  ${a.refNumber} — ${a._count.documents} dokumen (diputuskan ${a.decidedAt?.toISOString().slice(0, 10)})`);
  if (process.argv.includes("--execute")) {
    const sys = await prisma.user.findFirst({ where: { role: "ADMIN", active: true } });
    if (!sys) throw new Error("Tidak ada administrator aktif untuk dicatat pada audit.");
    const n = await purgeExpired(days, { id: sys.id, name: sys.name, role: "ADMIN" });
    console.log(`DIHAPUS PERMANEN: dokumen pada ${n} permohonan (jejak audit dipertahankan).`);
  } else console.log("Dry-run: tidak ada yang dihapus. Tambahkan --execute untuk menghapus.");
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
