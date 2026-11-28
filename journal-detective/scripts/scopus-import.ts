/*
 * Impor workbook Scopus Source List lewat Terminal (alternatif menu UI, berguna untuk berkas besar).
 *   npm run scopus:import -- /jalur/ext_list_Sep_2026.xlsx --version "September 2026" --date 2026-09-01 [--url https://...] [--as email-admin] [--yes]
 * Tanpa --yes: hanya membuat PRATINJAU (belum menyimpan record); konfirmasi dari menu Database Scopus atau jalankan ulang dengan --yes.
 * Tidak mengunduh apa pun dari internet. Tidak menghapus data. Tidak membuat Journal Passport.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { confirmImport, stageImport, ScopusImportError } from "../src/lib/services/scopusReference";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--") && /\.xlsx$/i.test(a));
  if (!file || !existsSync(file)) { console.error('Pemakaian: npm run scopus:import -- <berkas.xlsx> --version "September 2026" --date 2026-09-01 [--url URL] [--as email] [--yes]'); process.exit(2); }
  const email = arg("--as");
  const user = email ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } }) : await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "HEAD"] }, active: true }, orderBy: { createdAt: "asc" } });
  if (!user || !["ADMIN", "HEAD"].includes(user.role)) { console.error("Tidak ada pengguna ADMIN/HEAD aktif (gunakan --as email-admin)."); process.exit(2); }
  const actor = { id: user.id, name: user.name, role: user.role };
  console.log(`Membaca ${file} … (berkas besar dapat memerlukan beberapa menit)`);
  const imp = await stageImport({ filePath: path.resolve(file), fileName: path.basename(file), versionLabel: arg("--version") ?? "", observationDate: arg("--date") ?? "", sourceUrl: arg("--url") ?? null, actor });
  const s = JSON.parse(imp.summaryJson);
  console.log("PRATINJAU:");
  for (const sh of s.sheets) console.log(`  sheet "${sh.name}" → ${sh.role}, header baris ${sh.headerRow}, ${sh.rowsRead} baris data, ${sh.validRows} valid, ${sh.errorRows} galat`);
  for (const sh of s.ignoredSheets) console.log(`  sheet "${sh.name}" diabaikan: ${sh.reason}`);
  console.log(`  record hasil gabung: ${s.totals.records}; duplikat: ${s.totals.duplicates}; konflik: ${s.totals.conflicts} ${JSON.stringify(s.conflictsByType)}; galat: ${s.totals.errors}; peringatan: ${s.totals.warnings}`);
  console.log(`  sha256: ${imp.sha256}`);
  if (process.argv.includes("--yes")) {
    await confirmImport(imp.id, actor);
    console.log(`DIKONFIRMASI: ${imp.recordCount} record tersimpan; impor ini kini terkini (impor lama dipertahankan sebagai riwayat).`);
  } else console.log(`Belum disimpan. Konfirmasi di menu "Database Scopus" (/sources/scopus?preview=${imp.id}) atau jalankan ulang dengan --yes.`);
}
main().catch((e) => { console.error(e instanceof ScopusImportError ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
