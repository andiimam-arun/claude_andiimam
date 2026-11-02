/* Pemeriksaan kesiapan PILOT (read-only). Exit 1 bila ada FAIL. */
import { checkPilot } from "../src/lib/ops/pilot";
import { prisma } from "../src/lib/db";

async function main() {
  const res = await checkPilot();
  for (const r of res) console.log(`${r.level.padEnd(4)}  ${r.item}: ${r.detail}`);
  if (res.some((r) => r.level === "FAIL")) { console.log("\nHASIL: TIDAK SIAP (ada FAIL)."); process.exitCode = 1; }
  else console.log(res.some((r) => r.level === "WARN") ? "\nHASIL: dapat dijalankan dengan PERINGATAN (lihat WARN)." : "\nHASIL: SIAP.");
}
main().finally(() => prisma.$disconnect());
