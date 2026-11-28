/*
 * Impor CSV daftar jurnal DOAJ lewat Terminal (berkas ±26 MB melebihi batas unggah menu; gunakan perintah ini).
 *   npm run doaj:import -- /jalur/doaj.csv --version "DOAJ CSV Nov 2026" --date 2026-11-28 [--as email-admin]
 * Unduh CSV resmi dari https://doaj.org/csv (data terbuka DOAJ). Tidak mengunduh apa pun sendiri.
 * Impor baru yang lengkap menggantikan impor DOAJ sebelumnya (yang lama dinonaktifkan, riwayat dipertahankan). Tidak membuat Journal Passport.
 */
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { importDataset } from "../src/lib/services/reference";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--") && /\.csv$/i.test(a));
  const version = arg("--version"), date = arg("--date");
  if (!file || !existsSync(file) || !version || !date) { console.error('Pemakaian: npm run doaj:import -- <doaj.csv> --version "DOAJ CSV Nov 2026" --date YYYY-MM-DD [--as email]'); process.exit(2); }
  const email = arg("--as");
  const user = email ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } }) : await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "HEAD"] }, active: true }, orderBy: { createdAt: "asc" } });
  if (!user || !["ADMIN", "HEAD"].includes(user.role)) { console.error("Tidak ada pengguna ADMIN/HEAD aktif (gunakan --as email-admin)."); process.exit(2); }
  const buffer = readFileSync(path.resolve(file));
  console.log(`Mengimpor ${path.basename(file)} (${(buffer.length / 1048576).toFixed(1)} MB) …`);
  const ds = await importDataset({
    kind: "DOAJ_LIST", buffer, filename: path.basename(file), versionLabel: version, sourceDate: new Date(date), isComplete: true,
    provenance: "CSV daftar jurnal DOAJ (https://doaj.org/csv), data terbuka DOAJ; diunduh oleh operator.", actor: { id: user.id, name: user.name, role: user.role },
  });
  const v = JSON.parse(ds.validationJson);
  console.log(`SELESAI: ${ds.rowCount} jurnal tersimpan (versi "${ds.versionLabel}", tanggal data ${date}); sha256 ${ds.sha256.slice(0, 12)}…`);
  console.log(`  kolom terdeteksi: ${JSON.stringify(v.columns)}`);
  if (v.warnings?.length) console.log("  peringatan: " + v.warnings.join(" | "));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
