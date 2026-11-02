import bcrypt from "bcryptjs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "../db";
import { getMode, readMarker, staticConfigProblems, writeMarker } from "../mode";
import { DEMO_POLICY } from "../engine/policy";

export const DEMO_EMAIL_SUFFIX = "@jd.example";
export const isDemoAccountEmail = (email: string) => email.toLowerCase().endsWith(DEMO_EMAIL_SUFFIX);

export async function tableCounts() {
  const [users, journals, applications, assessments, evidence, policies, datasets, documents, findings, validationCases, letters] = await Promise.all([
    prisma.user.count(), prisma.journal.count(), prisma.application.count(), prisma.assessment.count(), prisma.evidence.count(), prisma.policy.count(),
    prisma.referenceDataset.count(), prisma.document.count(), prisma.destinationFinding.count(), prisma.validationCase.count(), prisma.letter.count(),
  ]);
  return { users, journals, applications, assessments, evidence, policies, datasets, documents, findings, validationCases, letters };
}

export class PilotInitError extends Error {}

export interface PilotInitInput { adminEmail: string; adminName: string; adminPassword: string }

/**
 * Inisialisasi PILOT yang aman: MENOLAK basis data yang tidak kosong atau yang sudah berpenanda lingkungan.
 * Tidak membuat jurnal/bukti/akun fiktif. Tidak pernah menghapus apa pun.
 */
export async function initializePilot(i: PilotInitInput) {
  if (getMode() !== "PILOT") throw new PilotInitError("APP_MODE harus PILOT untuk inisialisasi pilot.");
  const problems = staticConfigProblems();
  if (problems.length) throw new PilotInitError(problems.join("\n"));
  const counts = await tableCounts();
  const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0);
  const marker = await readMarker();
  if (nonEmpty.length || marker) {
    throw new PilotInitError(`Inisialisasi DITOLAK: basis data tidak kosong${marker ? ` / sudah bertanda ${marker.mode}` : ""} (${nonEmpty.map(([k, n]) => `${k}=${n}`).join(", ") || "tanpa baris"}). Tidak ada data yang diubah atau dihapus. Gunakan berkas basis data baru, atau pulihkan dari cadangan.`);
  }
  const email = i.adminEmail.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new PilotInitError("PILOT_ADMIN_EMAIL tidak valid.");
  if (isDemoAccountEmail(email)) throw new PilotInitError(`PILOT_ADMIN_EMAIL tidak boleh memakai domain demo ${DEMO_EMAIL_SUFFIX}.`);
  if (i.adminPassword.length < 12) throw new PilotInitError("PILOT_ADMIN_PASSWORD minimal 12 karakter.");
  if (/demo-journal-detective|password|12345678/i.test(i.adminPassword)) throw new PilotInitError("PILOT_ADMIN_PASSWORD tidak boleh memakai kata sandi demo/umum.");
  if (!i.adminName.trim()) throw new PilotInitError("PILOT_ADMIN_NAME wajib diisi.");
  mkdirSync(path.resolve(process.env.STORAGE_DIR || "./storage"), { recursive: true });
  const admin = await prisma.user.create({ data: { email, name: i.adminName.trim(), role: "ADMIN", passwordHash: await bcrypt.hash(i.adminPassword, 12) } });
  await prisma.policy.create({
    data: {
      version: 1, name: "Kebijakan resmi belum dikonfigurasi (placeholder sementara)", isDemo: true, configJson: JSON.stringify(DEMO_POLICY), active: true, createdBy: "sistem",
      note: "Placeholder agar investigasi dapat berjalan. BUKAN peraturan fakultas. Klirens resmi diblokir sampai pejabat berwenang menerbitkan kebijakan resmi.",
    },
  });
  await writeMarker("PILOT", "Diinisialisasi oleh pilot:init; tanpa data demonstrasi");
  await prisma.auditLog.create({ data: { actorId: admin.id, actorName: admin.name, actorRole: "ADMIN", action: "PILOT_INITIALIZED", entity: "System", detailJson: JSON.stringify({ admin: email }) } });
  return { adminEmail: email };
}

export interface CheckResult { level: "PASS" | "WARN" | "FAIL"; item: string; detail: string }

/** Pemeriksaan kesiapan lingkungan PILOT (read-only). */
export async function checkPilot(): Promise<CheckResult[]> {
  const r: CheckResult[] = [];
  const add = (level: CheckResult["level"], item: string, detail: string) => r.push({ level, item, detail });
  add(getMode() === "PILOT" ? "PASS" : "FAIL", "APP_MODE", `APP_MODE=${getMode()}`);
  for (const p of staticConfigProblems()) add("FAIL", "Pemisahan DEMO/PILOT", p);
  const marker = await readMarker();
  add(marker?.mode === "PILOT" ? "PASS" : "FAIL", "Penanda lingkungan basis data", marker ? `mode=${marker.mode}, ${marker.initializedAt}` : "tidak ada (jalankan pilot:init)");
  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: DEMO_EMAIL_SUFFIX } }, select: { email: true, active: true } });
  add(demoUsers.length === 0 ? "PASS" : "FAIL", "Akun demo", demoUsers.length ? `ada akun demo: ${demoUsers.map((u) => u.email).join(", ")}` : "tidak ada akun demo");
  const demoData = { datasetDemo: await prisma.referenceDataset.count({ where: { isDemo: true } }), journalDemo: await prisma.journal.count({ where: { isDemo: true } }), findingDemo: await prisma.destinationFinding.count({ where: { isDemo: true } }), fictionalCases: await prisma.validationCase.count({ where: { isFictionalFixture: true } }) };
  const dn = Object.values(demoData).reduce((a, b) => a + b, 0);
  add(dn === 0 ? "PASS" : "FAIL", "Data fiktif", dn ? JSON.stringify(demoData) : "tidak ada data berlabel fiktif");
  const active = await prisma.user.count({ where: { active: true } });
  add(active > 0 ? "PASS" : "FAIL", "Akun aktif", `${active} akun aktif bernama`);
  const heads = await prisma.user.count({ where: { role: "HEAD", active: true } });
  add(heads > 0 ? "PASS" : "WARN", "Kepala Unit", heads ? `${heads} akun HEAD aktif` : "belum ada akun HEAD — tidak ada yang dapat menyetujui");
  const pol = await prisma.policy.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
  add(pol && !pol.isDemo ? "PASS" : "WARN", "Kebijakan resmi", pol && !pol.isDemo ? `v${pol.version} RESMI` : "Kebijakan resmi belum dikonfigurasi — klirens resmi diblokir");
  const secret = process.env.SESSION_SECRET ?? "";
  add(secret.length >= 32 && !/dev-only|change-me/i.test(secret) ? "PASS" : "FAIL", "SESSION_SECRET", secret.length >= 32 ? "panjang memadai" : "kosong/terlalu pendek/bawaan");
  const base = process.env.PUBLIC_BASE_URL ?? "";
  add(base.startsWith("https://") ? "PASS" : "WARN", "PUBLIC_BASE_URL", base || "(kosong) — gunakan HTTPS");
  add(process.env.INSECURE_COOKIES === "1" ? "FAIL" : "PASS", "INSECURE_COOKIES", process.env.INSECURE_COOKIES === "1" ? "aktif (hanya untuk uji lokal)" : "nonaktif");
  add(process.env.DEMO_PASSWORD ? "WARN" : "PASS", "DEMO_PASSWORD", process.env.DEMO_PASSWORD ? "variabel demo masih diset di lingkungan ini" : "tidak diset");
  const aiOn = process.env.AI_EXTERNAL_ENABLED === "1";
  add(aiOn ? "WARN" : "PASS", "Layanan AI eksternal", aiOn ? `diaktifkan operator; pengakuan penanganan data: ${process.env.AI_DATA_HANDLING_ACK ? "ada" : "TIDAK ADA"}` : "nonaktif (tidak ada data keluar)");
  const docs = await prisma.document.count();
  add("PASS", "Dokumen", `${docs} dokumen terunggah (hanya lewat API terlindungi)`);
  return r;
}
