import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createApplication } from "@/lib/services/applications";
import { uploadDocument } from "@/lib/services/documents";
import { createBackup, restoreBackup } from "@/lib/ops/backup";
import { findExpiredDocuments } from "@/lib/ops/retention";
import { makeUsers, form, type U } from "./helpers";

let u: { admin: U; reviewer: U; head: U; student: U };
beforeAll(async () => { u = await makeUsers("ops"); });

describe("9. cadangan & pemulihan (data tidak rahasia, uji terkendali)", () => {
  const work = mkdtempSync(path.join(tmpdir(), "jd-backup-"));
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it("pemulihan mempertahankan baris dan integritas dokumen; menolak menimpa; mendeteksi cadangan rusak", async () => {
    const app = await createApplication(form({ journalName: "Jurnal Cadangan Uji (FIKTIF)", journalIssn: "9900-0059", journalPublisher: "P", claimedIndexing: "", journalUrl: "https://cadangan-uji.example" }), u.student, u.student.id);
    const content = Buffer.from("[DOKUMEN FIKTIF] isi dokumen untuk uji cadangan\nManuscript ID: BK-001\n" + "x".repeat(2000));
    const doc = await uploadDocument({ applicationId: app.id, docType: "OTHER", filename: "bukti-fiktif.txt", data: content, actor: u.student });
    const out = path.join(work, "cadangan-1");
    const m = await createBackup({ outDir: out, storageDir: "./storage-test" });
    expect(m.counts.documents).toBeGreaterThanOrEqual(1);
    expect(m.documents.some((d) => d.id === doc.id && d.sha256 === doc.sha256)).toBe(true);
    await expect(createBackup({ outDir: out, storageDir: "./storage-test" })).rejects.toThrow(/sudah berisi/); // tidak menimpa cadangan

    const tdb = path.join(work, "pulih", "restored.db"), tst = path.join(work, "pulih", "storage");
    const rep = await restoreBackup({ backupDir: out, targetDb: tdb, targetStorage: tst });
    expect(rep.problems).toEqual([]);
    expect(rep.ok).toBe(true);
    expect(rep.documentsChecked).toBeGreaterThanOrEqual(1);
    // baris identik dengan sumber, dokumen identik bit-demi-bit
    const c = new PrismaClient({ datasources: { db: { url: `file:${tdb}` } } });
    expect(await c.application.count()).toBe(await prisma.application.count());
    expect(await c.document.count()).toBe(await prisma.document.count());
    const d2 = await c.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(readFileSync(path.join(tst, d2.storagePath)).equals(content)).toBe(true);
    await c.$disconnect();
    // tidak boleh menimpa tanpa --overwrite
    await expect(restoreBackup({ backupDir: out, targetDb: tdb, targetStorage: tst })).rejects.toThrow(/sudah ada|tidak kosong/);
    // cadangan yang diubah terdeteksi SEBELUM disalin
    const files = readdirSync(path.join(out, "storage"), { recursive: true }) as string[];
    const victim = files.find((f) => f.endsWith(".txt"))!;
    writeFileSync(path.join(out, "storage", victim), "DIUBAH");
    const bad = await restoreBackup({ backupDir: out, targetDb: path.join(work, "x", "b.db"), targetStorage: path.join(work, "x", "s") });
    expect(bad.ok).toBe(false);
    expect(bad.problems.join()).toMatch(/rusak|hilang/);
    expect(existsSync(path.join(work, "x", "b.db"))).toBe(false); // tidak ada pemulihan parsial
  });
});

describe("retensi: hanya melaporkan, tidak menghapus otomatis", () => {
  it("dokumen pada permohonan final yang melewati masa retensi dilaporkan", async () => {
    const app = await createApplication(form({ journalName: "Jurnal Retensi (FIKTIF)", journalIssn: "9900-0059", journalPublisher: "P", claimedIndexing: "", journalUrl: "https://retensi.example" }), u.student, u.student.id);
    await uploadDocument({ applicationId: app.id, docType: "OTHER", filename: "r.txt", data: Buffer.from("[FIKTIF] retensi uji"), actor: u.student });
    await prisma.application.update({ where: { id: app.id }, data: { workflow: "APPROVED", decidedAt: new Date(Date.now() - 400 * 86_400_000) } });
    expect((await findExpiredDocuments(365)).some((a) => a.id === app.id)).toBe(true);
    expect((await findExpiredDocuments(900)).some((a) => a.id === app.id)).toBe(false);
    expect(await prisma.document.count({ where: { applicationId: app.id } })).toBe(1); // belum ada penghapusan
  });
});

describe("inisialisasi PILOT yang aman (skrip nyata, basis data sementara)", () => {
  const DB = "pilot-t1.db", ST = `./storage-pilot-t1-${process.pid}`;
  const env = (over: Record<string, string> = {}) => {
    const e: Record<string, string> = { ...(process.env as Record<string, string>), APP_MODE: "PILOT", DATABASE_URL: `file:./${DB}`, STORAGE_DIR: ST, PILOT_ADMIN_EMAIL: "admin.pilot@unit.example", PILOT_ADMIN_NAME: "Admin Pilot", PILOT_ADMIN_PASSWORD: "kata-sandi-pilot-kuat-1", SESSION_SECRET: "x".repeat(40), PUBLIC_BASE_URL: "https://pilot.example", NODE_ENV: "development", ...over };
    delete e.DEMO_PASSWORD; delete e.INSECURE_COOKIES; delete e.VITEST;
    return e;
  };
  const run = (script: string, over: Record<string, string> = {}) => spawnSync("npx", ["tsx", "--conditions=react-server", script], { env: env(over) as NodeJS.ProcessEnv, encoding: "utf8", timeout: 120_000 });
  const cleanup = () => { for (const f of [DB, `${DB}-journal`]) rmSync(path.resolve("prisma", f), { force: true }); rmSync(ST, { recursive: true, force: true }); };
  beforeAll(cleanup); afterAll(cleanup);

  it("menolak lokasi DEMO (dev.db / ./storage) tanpa menyentuh apa pun", () => {
    const r = run("scripts/pilot-init.ts", { DATABASE_URL: "file:./dev.db", STORAGE_DIR: "./storage" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/DATABASE_URL|STORAGE_DIR/);
  });
  it("basis data kosong → terinisialisasi tanpa data/akun demo; menjalankan ulang DITOLAK dan tidak mengubah apa pun", async () => {
    const r1 = run("scripts/pilot-init.ts");
    expect(r1.status, r1.stderr + r1.stdout).toBe(0);
    const c = new PrismaClient({ datasources: { db: { url: `file:${path.resolve("prisma", DB)}` } } });
    expect(await c.user.count()).toBe(1);
    expect((await c.user.findFirstOrThrow()).email).toBe("admin.pilot@unit.example");
    expect(await c.user.count({ where: { email: { endsWith: "@jd.example" } } })).toBe(0);
    expect(await c.journal.count()).toBe(0);
    expect(await c.referenceDataset.count()).toBe(0);
    expect(await c.evidence.count()).toBe(0);
    expect(await c.application.count()).toBe(0);
    expect(await c.validationCase.count()).toBe(0);
    const pol = await c.policy.findMany();
    expect(pol).toHaveLength(1);
    expect(pol[0].isDemo).toBe(true); // placeholder, bukan kebijakan resmi
    expect(pol[0].name).toMatch(/belum dikonfigurasi/);
    expect(JSON.parse((await c.setting.findUniqueOrThrow({ where: { key: "environment" } })).valueJson).mode).toBe("PILOT");
    const before = { u: await c.user.count(), a: await c.auditLog.count() };
    const r2 = run("scripts/pilot-init.ts");
    expect(r2.status).toBe(3);
    expect(r2.stderr).toMatch(/DITOLAK/);
    expect({ u: await c.user.count(), a: await c.auditLog.count() }).toEqual(before);
    await c.$disconnect();
  });
  it("kata sandi lemah/demo atau email demo ditolak pada inisialisasi", () => {
    const f = (over: Record<string, string>) => { rmSync(path.resolve("prisma", "pilot-t1b.db"), { force: true }); return run("scripts/pilot-init.ts", { DATABASE_URL: "file:./pilot-t1b.db", ...over }); };
    expect(f({ PILOT_ADMIN_PASSWORD: "pendek" }).status).toBe(3);
    expect(f({ PILOT_ADMIN_PASSWORD: "demo-journal-detective" }).status).toBe(3);
    expect(f({ PILOT_ADMIN_EMAIL: "admin@jd.example" }).status).toBe(3);
    rmSync(path.resolve("prisma", "pilot-t1b.db"), { force: true });
  });
  it("pilot:check — tanpa FAIL; kebijakan resmi belum ada = WARN; tidak ada akun/data demo", () => {
    const r = run("scripts/pilot-check.ts");
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toMatch(/PASS\s+Akun demo/);
    expect(r.stdout).toMatch(/PASS\s+Data fiktif/);
    expect(r.stdout).toMatch(/WARN\s+Kebijakan resmi: Kebijakan resmi belum dikonfigurasi/);
    expect(r.stdout).toMatch(/PASS\s+Layanan AI eksternal: nonaktif/);
  });
  it("pilot:check gagal (FAIL) bila ada akun demo", async () => {
    const c = new PrismaClient({ datasources: { db: { url: `file:${path.resolve("prisma", DB)}` } } });
    await c.user.create({ data: { email: "kepala@jd.example", name: "Demo", role: "HEAD", passwordHash: "x" } });
    const r = run("scripts/pilot-check.ts");
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/FAIL\s+Akun demo/);
    await c.$disconnect();
  });
  it("seed demonstrasi ditolak pada PILOT", () => {
    const r = spawnSync("npx", ["tsx", "--conditions=react-server", "prisma/seed.ts"], { env: env() as NodeJS.ProcessEnv, encoding: "utf8", timeout: 120_000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/hanya untuk APP_MODE=DEMO/);
  });
});
void cpSync;
