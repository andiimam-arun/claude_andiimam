// Pemeriksaan persistensi: server dimulai → dibaca → DIMATIKAN → dimulai ulang → data & berkas yang diunggah harus identik.
// Pakai: DATABASE_URL=file:./e2e.db STORAGE_DIR=./storage-e2e PW_CHROMIUM=... node scripts/restart-check.mjs  (setelah `npm run test:e2e`)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const PORT = 3111;
const env = { ...process.env, SESSION_SECRET: "restart-check-secret-restart-check-secret-1234", INSECURE_COOKIES: "1", DISABLE_EXTERNAL_LOOKUPS: "1" };
const prisma = new PrismaClient();
const doc = await prisma.document.findFirstOrThrow({ where: { filename: { endsWith: ".pdf" } } });
const before = { journals: await prisma.journal.count(), assessments: await prisma.assessment.count(), docs: await prisma.document.count(), audit: await prisma.auditLog.count() };

async function runServer() {
  const p = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/login`)).ok) return p; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("server tidak siap");
}
const stop = (p) => { try { process.kill(-p.pid); } catch {} return new Promise((r) => setTimeout(r, 1500)); };

async function check(label) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args: ["--no-sandbox"] });
  const page = await b.newPage();
  await page.goto(`http://localhost:${PORT}/login`);
  await page.fill('input[name="email"]', "peninjau@jd.example");
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD || "demo-journal-detective");
  await page.click('button[type="submit"]');
  await page.waitForURL(`http://localhost:${PORT}/`);
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const r = await fetch(`http://localhost:${PORT}/api/documents/${doc.id}`, { headers: { cookie } });
  const sha = createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex");
  await page.goto(`http://localhost:${PORT}/assessments?q=9900-0067`);
  const rows = await page.locator("tbody tr").count();
  await b.close();
  const ok = r.status === 200 && sha === doc.sha256 && rows >= 3;
  console.log(`${label}: dokumen HTTP ${r.status}, sha256 ${sha === doc.sha256 ? "IDENTIK" : "BERBEDA"}, riwayat penilaian ${rows} baris → ${ok ? "OK" : "GAGAL"}`);
  if (!ok) process.exitCode = 1;
}

let s = await runServer(); await check("sebelum restart"); await stop(s);
s = await runServer(); await check("setelah restart ");
const after = { journals: await prisma.journal.count(), assessments: await prisma.assessment.count(), docs: await prisma.document.count(), audit: await prisma.auditLog.count() };
console.log("jumlah baris sebelum:", JSON.stringify(before), "sesudah:", JSON.stringify(after), JSON.stringify(before) === JSON.stringify(after) ? "→ IDENTIK" : "→ BERBEDA");
await stop(s); await prisma.$disconnect();
