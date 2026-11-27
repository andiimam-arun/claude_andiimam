/*
 * Membuat akun anggota tim secara massal dari berkas CSV (kolom: email,name,role).
 *   npm run users:bulk -- daftar.csv                         # DRY-RUN (hanya menampilkan rencana)
 *   npm run users:bulk -- daftar.csv --apply [--out akun.csv] # membuat akun; kredensial ditulis ke berkas lokal (izin 600)
 * Kata sandi acak 16 karakter; TIDAK dicetak ke layar. Akun yang sudah ada tidak diubah. Tidak menghapus apa pun.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import Papa from "papaparse";
import { prisma } from "../src/lib/db";
import { createUsers, planUsers, type UserRow } from "../src/lib/ops/users";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--") && /\.csv$/i.test(a));
  if (!file || !existsSync(file)) { console.error("Pemakaian: npm run users:bulk -- daftar.csv [--apply] [--out akun.csv] [--as email-admin]"); process.exit(2); }
  const parsed = Papa.parse<UserRow>(readFileSync(file, "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const plan = await planUsers(parsed.data.map((r) => ({ email: r.email ?? "", name: r.name ?? "", role: r.role ?? "" })));
  for (const p of plan) console.log(`${p.action.padEnd(11)} ${p.row.role.padEnd(8)} ${p.row.email || "(email kosong)"}  ${p.row.name}${p.message ? `  — ${p.message}` : ""}`);
  const errors = plan.filter((p) => p.action === "ERROR").length, toCreate = plan.filter((p) => p.action === "CREATE").length;
  console.log(`\nRingkasan: ${toCreate} akan dibuat, ${plan.filter((p) => p.action === "SKIP_EXISTS").length} sudah ada, ${errors} galat.`);
  if (!process.argv.includes("--apply")) { console.log("DRY-RUN: belum ada yang dibuat. Tambahkan --apply setelah rencana benar."); return; }
  if (errors) { console.error("Ada galat; perbaiki berkas terlebih dahulu. Tidak ada akun dibuat."); process.exitCode = 1; return; }
  const email = arg("--as");
  const admin = email ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } }) : await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "HEAD"] }, active: true }, orderBy: { createdAt: "asc" } });
  if (!admin) { console.error("Tidak ada pengguna ADMIN/HEAD aktif untuk dicatat pada audit (gunakan --as)."); process.exitCode = 1; return; }
  const created = await createUsers(plan, { id: admin.id, name: admin.name, role: admin.role });
  if (!created.length) { console.log("Tidak ada akun baru; tidak ada berkas kredensial ditulis."); return; }
  const out = arg("--out") ?? `akun-tim-${new Date().toISOString().slice(0, 10)}.csv`;
  if (existsSync(out)) { console.error(`Berkas ${out} sudah ada; kredensial TIDAK ditulis (jangan menimpa). Pilih --out lain. ${created.length} akun TELAH dibuat — kata sandi hilang; atur ulang dengan menonaktifkan akun dan membuat ulang.`); process.exitCode = 1; return; }
  writeFileSync(out, "email,name,role,password\n" + created.map((c) => [c.email, c.name, c.role, c.password].map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n") + "\n", { mode: 0o600 });
  chmodSync(out, 0o600);
  console.log(`DIBUAT ${created.length} akun. Kredensial ditulis ke ${out} (izin 600). Bagikan kata sandi ke masing-masing orang lewat saluran aman, lalu HAPUS berkas ini.`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
