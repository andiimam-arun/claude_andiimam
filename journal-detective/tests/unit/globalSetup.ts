import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

// Basis data uji terpisah (SQLite) dibuat dari migrasi yang sama dengan produksi.
export default function setup() {
  const file = path.resolve("prisma", "test.db");
  for (const f of [file, file + "-journal"]) if (existsSync(f)) rmSync(f);
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: "file:./test.db" } });
}
