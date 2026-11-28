/* Inisialisasi lingkungan PILOT yang aman. Menolak basis data tidak kosong. Lihat docs/PILOT_RUNBOOK.md */
import { execSync } from "node:child_process";
import { initializePilot, PilotInitError } from "../src/lib/ops/pilot";
import { prisma } from "../src/lib/db";
import { getMode, staticConfigProblems } from "../src/lib/mode";

async function main() {
  if (getMode() !== "PILOT") { console.error("DITOLAK: set APP_MODE=PILOT (dan DATABASE_URL/STORAGE_DIR khusus pilot)."); process.exit(2); }
  const pr = staticConfigProblems();
  if (pr.length) { console.error("DITOLAK:\n - " + pr.join("\n - ")); process.exit(2); }
  // Terapkan migrasi (bersifat penambahan; tidak menghapus data).
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  try {
    const r = await initializePilot({ adminEmail: process.env.PILOT_ADMIN_EMAIL ?? "", adminName: process.env.PILOT_ADMIN_NAME ?? "", adminPassword: process.env.PILOT_ADMIN_PASSWORD ?? "" });
    console.log(`PILOT diinisialisasi. Administrator pertama: ${r.adminEmail}. Tidak ada data/akun demo dibuat.`);
    console.log("Langkah berikut: masuk sebagai administrator, buat akun bernama (Kepala Unit, peninjau), lalu Kepala Unit menerbitkan kebijakan RESMI.");
  } catch (e) {
    if (e instanceof PilotInitError) { console.error(e.message); process.exitCode = 3; } else throw e;
  }
}
main().finally(() => prisma.$disconnect());
