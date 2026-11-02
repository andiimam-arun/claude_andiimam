"use server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { importDataset, DATASET_KINDS, type DatasetKind } from "@/lib/services/reference";
import { publishPolicy, getActivePolicy } from "@/lib/services/policyService";
import { saveSetting } from "@/lib/services/settings";
import { audit } from "@/lib/services/audit";
import { setRetention } from "@/lib/ops/retention";
import { DOC_TYPES, STAGES, type DocType } from "@/lib/engine/types";
import { ROLES } from "@/lib/engine/approval";
import { go, str, errMsg } from "./util";

export async function importDatasetAction(form: FormData) {
  const user = await requireRole("ADMIN", "HEAD");
  try {
    const f = form.get("file");
    if (!(f instanceof File) || f.size === 0) throw new Error("Pilih berkas CSV/XLSX");
    if (f.size > 25 * 1024 * 1024) throw new Error("Berkas terlalu besar (maks 25 MB)");
    const kind = str(form, "kind") as DatasetKind;
    if (!DATASET_KINDS.includes(kind)) throw new Error("Jenis dataset tidak valid");
    if (str(form, "legal") !== "on") throw new Error("Konfirmasi bahwa data diperoleh secara sah dan sesuai lisensi sumber");
    await importDataset({
      kind, buffer: Buffer.from(await f.arrayBuffer()), filename: f.name, versionLabel: str(form, "versionLabel"), provenance: str(form, "provenance"),
      sourceDate: str(form, "sourceDate") ? new Date(str(form, "sourceDate")) : null, isComplete: str(form, "isComplete") === "on", actor: user,
    });
  } catch (e) { go("/sources", { error: errMsg(e) }); }
  go("/sources", { notice: "Dataset diimpor dengan catatan asal-usul & versi." });
}

export async function toggleDatasetAction(form: FormData) {
  const user = await requireRole("ADMIN", "HEAD");
  const d = await prisma.referenceDataset.findUniqueOrThrow({ where: { id: str(form, "id") } });
  await prisma.referenceDataset.update({ where: { id: d.id }, data: { active: !d.active } });
  await audit(user, d.active ? "DATASET_DEACTIVATED" : "DATASET_ACTIVATED", "ReferenceDataset", d.id);
  go("/sources", { notice: "Status dataset diubah." });
}

export async function savePolicyAction(form: FormData) {
  const user = await requireRole("ADMIN", "HEAD");
  try {
    const cur = await getActivePolicy();
    const docs: Record<string, DocType[]> = {};
    for (const s of STAGES) docs[s] = DOC_TYPES.filter((d) => form.get(`doc_${s}_${d}`) === "on");
    const num = (k: string) => Number(str(form, k));
    const reassess = str(form, "reassessmentIntervalDays");
    const config = {
      requireCurrentScopus: form.get("requireCurrentScopus") === "on",
      discontinuedHandling: str(form, "discontinuedHandling"),
      acceptNationalAccredited: form.get("acceptNationalAccredited") === "on",
      acceptedAccreditationLevels: str(form, "acceptedAccreditationLevels").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
      requiredQuartiles: ["Q1", "Q2", "Q3", "Q4"].filter((q) => form.get(`q_${q}`) === "on"),
      quartileMandatory: form.get("quartileMandatory") === "on",
      maxIndexEvidenceAgeDays: num("maxIndexEvidenceAgeDays"),
      requiredDocuments: docs,
      escalationEvidenceKeys: str(form, "escalationEvidenceKeys").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
      evidenceReviewDeadlineDays: num("evidenceReviewDeadlineDays"),
      reassessmentIntervalDays: reassess ? Number(reassess) : null,
      fastAcceptanceWarnDays: num("fastAcceptanceWarnDays"),
      headMayOverridePolicyIneligible: form.get("headMayOverridePolicyIneligible") === "on",
    };
    const official = form.get("isOfficial") === "on";
    if (official && user.role !== "HEAD") throw new Error("Hanya Kepala Unit Publikasi yang dapat menandai kebijakan sebagai RESMI.");
    await publishPolicy(user, { name: str(form, "name") || cur.name, config, isDemo: !official, note: str(form, "note") });
  } catch (e) { go("/settings", { error: errMsg(e) }); }
  go("/settings", { notice: "Versi kebijakan baru diterbitkan dan dicatat pada audit." });
}

export async function saveBrandingAction(form: FormData) {
  const user = await requireRole("ADMIN", "HEAD");
  const b: Record<string, string> = {};
  for (const k of ["institution", "faculty", "unit", "address", "approverName", "approverTitle", "approverNip", "city"]) b[k] = str(form, k);
  await saveSetting("branding", b);
  await audit(user, "BRANDING_UPDATED", "Setting", "branding", b);
  go("/settings", { notice: "Identitas surat disimpan." });
}

export async function saveTemplatesAction(form: FormData) {
  const user = await requireRole("ADMIN", "HEAD");
  const t: Record<string, Record<string, string>> = {};
  for (const type of ["PRE_SUBMISSION", "POST_ACCEPTANCE_PAYMENT"]) {
    t[type] = {};
    for (const f of ["title", "opening", "approval", "closing"]) t[type][f] = str(form, `${type}_${f}`);
  }
  await saveSetting("letterTemplates", t);
  await audit(user, "TEMPLATES_UPDATED", "Setting", "letterTemplates", {});
  go("/settings", { notice: "Templat surat disimpan." });
}

export async function createUserAction(form: FormData) {
  const user = await requireRole("ADMIN");
  try {
    const email = str(form, "email").toLowerCase();
    const role = str(form, "role");
    const pw = String(form.get("password") ?? "");
    if (!ROLES.includes(role as any)) throw new Error("Peran tidak valid");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email tidak valid");
    if (pw.length < 10) throw new Error("Kata sandi minimal 10 karakter");
    const u = await prisma.user.create({ data: { email, name: str(form, "name"), role, passwordHash: await bcrypt.hash(pw, 11), studentNumber: str(form, "studentNumber") || null, studyProgram: str(form, "studyProgram") || null } });
    await audit(user, "USER_CREATED", "User", u.id, { email, role });
  } catch (e) { go("/settings#pengguna", { error: errMsg(e) }); }
  go("/settings#pengguna", { notice: "Pengguna dibuat." });
}

export async function toggleUserAction(form: FormData) {
  const user = await requireRole("ADMIN");
  const u = await prisma.user.findUniqueOrThrow({ where: { id: str(form, "id") } });
  if (u.id === user.id) go("/settings#pengguna", { error: "Tidak dapat menonaktifkan akun sendiri." });
  await prisma.user.update({ where: { id: u.id }, data: { active: !u.active } });
  await audit(user, u.active ? "USER_DEACTIVATED" : "USER_ACTIVATED", "User", u.id);
  go("/settings#pengguna", { notice: "Status pengguna diubah." });
}

export async function saveRetentionAction(form: FormData) {
  const user = await requireRole("ADMIN", "HEAD");
  try { const v = str(form, "days"); await setRetention(v ? Number(v) : null, user); } catch (e) { go("/settings", { error: errMsg(e) }); }
  go("/settings", { notice: "Masa retensi disimpan. Tidak ada penghapusan otomatis; gunakan `npm run pilot:retention` (dry-run) lalu --execute." });
}
