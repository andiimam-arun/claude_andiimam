// Menghapus berkas SQLite lokal (hanya URL file:), menerapkan migrasi, lalu seed data demonstrasi FIKTIF.
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import "dotenv/config";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
if (!url.startsWith("file:")) {
  console.error("db:reset hanya untuk SQLite lokal (DATABASE_URL file:...). Untuk PostgreSQL gunakan prosedur pada docs/DEPLOYMENT.md.");
  process.exit(1);
}
const file = path.resolve("prisma", url.replace(/^file:/, ""));
for (const f of [file, file + "-journal"]) if (existsSync(f)) rmSync(f);
execSync("npx prisma migrate deploy", { stdio: "inherit" });
execSync("npm run db:seed", { stdio: "inherit" });
