import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../db";
import { z } from "zod";
import { compareAll, DISCREPANCY_CLASSES, ENGINE_VERSION, VALIDATION_CATEGORIES, type Dimension, type GenStatus, type RefStatus } from "../engine/validation";
import { decideAdministrative, decideFinal } from "../engine/clearance";
import { sha256, parseJson } from "../engine/util";
import { normalizeIssn } from "../engine/issn";
import { normalizeDestination } from "../engine/domain";
import type { Stage, TrafficLight } from "../engine/types";
import { audit, type Actor } from "./audit";
import { getActivePolicy } from "./policyService";
import { loadAssessment, runInvestigation } from "./investigation";
import { evaluateApplication, reassessApplicationJournal } from "./applications";
import { getMode, isPilot } from "../mode";

export class ValidationError extends Error {}
const staff = (a: Actor & { role?: string }) => { if (!["REVIEWER", "HEAD"].includes(a.role ?? "")) throw new ValidationError("Hanya peninjau/Kepala Unit yang dapat mengelola validasi."); };

export const SHELL_PREFIX = "[ISI KASUS NYATA]";

const sourceSchema = z.object({ label: z.string().trim().min(2).max(200), url: z.string().trim().url().optional().or(z.literal("")), ref: z.string().trim().max(300).optional(), sourceDataDate: z.string().optional(), retrievedAt: z.string().optional() })
  .refine((s) => s.url || s.ref, { message: "Setiap sumber wajib memuat URL atau referensi dokumen" });
export type SourceRef = z.infer<typeof sourceSchema>;

export const caseSchema = z.object({
  category: z.enum(VALIDATION_CATEGORIES.map((c) => c.code) as [string, ...string[]]),
  title: z.string().trim().min(3).max(300), issn: z.string().trim().max(20).optional().nullable(), eissn: z.string().trim().max(20).optional().nullable(),
  submittedUrl: z.string().trim().max(400).optional().nullable(), authenticUrl: z.string().trim().max(400).optional().nullable(),
  stage: z.string().default("PRE_SUBMISSION"), pseudonym: z.string().trim().max(60).optional().nullable(), notes: z.string().trim().max(2000).optional().nullable(),
  applicationId: z.string().optional().nullable(), isFictionalFixture: z.boolean().default(false), sources: z.array(sourceSchema).default([]),
});
export type CaseInput = z.infer<typeof caseSchema>;

async function nextCode() { const n = await prisma.validationCase.count(); return `VC-${String(n + 1).padStart(3, "0")}`; }

export async function createCase(input: CaseInput, actor: Actor & { role?: string }) {
  staff(actor);
  const v = caseSchema.parse(input);
  if (v.isFictionalFixture && isPilot()) throw new ValidationError("Kasus fiktif tidak diizinkan pada mode PILOT (bukan validasi nyata).");
  const c = await prisma.validationCase.create({
    data: {
      caseCode: await nextCode(), category: v.category, title: v.title, issn: normalizeIssn(v.issn) ?? v.issn ?? null, eissn: normalizeIssn(v.eissn) ?? v.eissn ?? null,
      submittedUrl: v.submittedUrl || null, authenticUrl: v.authenticUrl || null, stage: v.stage, pseudonym: v.pseudonym || null, notes: v.notes || null,
      applicationId: v.applicationId || null, isFictionalFixture: v.isFictionalFixture, sourcesJson: JSON.stringify(v.sources), createdById: actor.id,
    },
  });
  await audit(actor, "VALIDATION_CASE_CREATED", "ValidationCase", c.id, { code: c.caseCode, category: v.category, fictional: v.isFictionalFixture });
  return c;
}

/** Kerangka cakupan: 10 kasus kosong berstatus AWAITING_MANUAL_REFERENCE. TIDAK mengarang jurnal atau hasil. Hanya dibuat atas tindakan eksplisit. */
export async function createCoverageShells(actor: Actor & { role?: string }) {
  staff(actor);
  const existing = new Set((await prisma.validationCase.findMany({ where: { isFictionalFixture: false }, select: { category: true } })).map((c) => c.category));
  let n = 0;
  for (const cat of VALIDATION_CATEGORIES) {
    if (existing.has(cat.code)) continue;
    await prisma.validationCase.create({ data: { caseCode: await nextCode(), category: cat.code, title: `${SHELL_PREFIX} ${cat.id}`, createdById: actor.id, status: "AWAITING_MANUAL_REFERENCE", sourcesJson: "[]" } });
    n++;
  }
  await audit(actor, "VALIDATION_SHELLS_CREATED", "ValidationCase", null, { created: n });
  return n;
}

export async function updateCaseDetails(caseId: string, input: CaseInput, actor: Actor & { role?: string }) {
  staff(actor);
  const c = await prisma.validationCase.findUniqueOrThrow({ where: { id: caseId }, include: { references: true } });
  if (c.references.length) throw new ValidationError("Detail kasus dikunci setelah referensi manual dicatat (menjaga integritas perbandingan). Buat kasus baru bila perlu.");
  const v = caseSchema.parse(input);
  await prisma.validationCase.update({ where: { id: caseId }, data: { category: v.category, title: v.title, issn: normalizeIssn(v.issn) ?? v.issn ?? null, eissn: normalizeIssn(v.eissn) ?? v.eissn ?? null, submittedUrl: v.submittedUrl || null, authenticUrl: v.authenticUrl || null, stage: v.stage, pseudonym: v.pseudonym || null, notes: v.notes || null, applicationId: v.applicationId || null, sourcesJson: JSON.stringify(v.sources) } });
  await audit(actor, "VALIDATION_CASE_UPDATED", "ValidationCase", caseId, {});
}

const refStatus = z.enum(["GREEN", "YELLOW", "RED", "NOT_ASSESSED"]);
export const referenceSchema = z.object({
  journalStatus: refStatus, destinationStatus: refStatus, adminStatus: refStatus, finalStatus: refStatus,
  rationale: z.string().trim().min(20, "Rasional referensi minimal 20 karakter"), uncertainty: z.string().trim().max(2000).optional().nullable(),
  assessedAt: z.string().min(8), sources: z.array(sourceSchema).min(1, "Minimal satu sumber (URL atau referensi dokumen)"),
});
export type ReferenceInput = z.infer<typeof referenceSchema>;

/** Mencatat penilaian referensi manual (append-only, versi bertambah). Dicatat SEBELUM rekomendasi aplikasi diungkap. */
export async function recordReference(caseId: string, input: ReferenceInput, actor: Actor & { role?: string }) {
  staff(actor);
  const c = await prisma.validationCase.findUniqueOrThrow({ where: { id: caseId } });
  if (c.title.startsWith(SHELL_PREFIX)) throw new ValidationError("Lengkapi detail kasus (judul jurnal, ISSN, URL) sebelum mencatat referensi.");
  const v = referenceSchema.parse(input);
  const at = new Date(v.assessedAt);
  if (isNaN(at.getTime()) || at.getTime() > Date.now() + 86_400_000) throw new ValidationError("Tanggal penilaian tidak valid/di masa depan.");
  const policy = await getActivePolicy();
  const last = await prisma.validationReference.findFirst({ where: { caseId }, orderBy: { version: "desc" } });
  const ref = await prisma.validationReference.create({
    data: { caseId, version: (last?.version ?? 0) + 1, journalStatus: v.journalStatus, destinationStatus: v.destinationStatus, adminStatus: v.adminStatus, finalStatus: v.finalStatus, rationale: v.rationale, uncertainty: v.uncertainty || null, assessorId: actor.id, assessorName: actor.name, assessedAt: at, policyVersion: policy.version, sourcesJson: JSON.stringify(v.sources) },
  });
  await prisma.validationCase.update({ where: { id: caseId }, data: { status: "REFERENCE_RECORDED" } });
  await audit(actor, "VALIDATION_REFERENCE_RECORDED", "ValidationReference", ref.id, { caseId, version: ref.version }, policy.version);
  return ref;
}

function appVersion() {
  let v = "0";
  try { v = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).version; } catch { /* abaikan */ }
  return `app ${v} / engine ${ENGINE_VERSION}${process.env.GIT_COMMIT ? ` / ${process.env.GIT_COMMIT}` : ""}`;
}

/** Menjalankan aplikasi pada kasus. WAJIB ada referensi manual terlebih dahulu (anti-anchoring). Menyimpan snapshot bukti/kebijakan/versi. */
export async function runCase(caseId: string, actor: Actor & { role?: string }, opts: { retestOfRunId?: string } = {}) {
  staff(actor);
  const c = await prisma.validationCase.findUniqueOrThrow({ where: { id: caseId } });
  const ref = await prisma.validationReference.findFirst({ where: { caseId }, orderBy: { version: "desc" } });
  if (!ref) throw new ValidationError("Catat penilaian referensi manual lebih dahulu; rekomendasi aplikasi tidak dijalankan/diungkap sebelum itu.");
  if (c.title.startsWith(SHELL_PREFIX)) throw new ValidationError("Kasus masih berupa kerangka.");
  if (c.isFictionalFixture && isPilot()) throw new ValidationError("Kasus fiktif tidak dapat dijalankan pada PILOT.");
  const policy = await getActivePolicy();
  let assessmentId: string; let applicationSnapshot: unknown = null; let journalS: TrafficLight; let destS: TrafficLight; let adminS: GenStatus; let finalS: GenStatus;
  let officialHosts: string[] = [];
  if (c.applicationId) {
    const inv = await reassessApplicationJournal(c.applicationId, actor);
    const app = await prisma.application.findUniqueOrThrow({ where: { id: c.applicationId } });
    const ev = await evaluateApplication(app);
    assessmentId = inv.assessmentId;
    journalS = inv.decision.journalStatus; destS = inv.decision.destinationStatus; adminS = ev.administrative.status; finalS = ev.final?.status ?? "NOT_EVALUATED";
    applicationSnapshot = { id: app.id, ref: app.refNumber, stage: app.stage, workflow: app.workflow, updatedAt: app.updatedAt.toISOString(), journalName: app.journalName, journalUrl: app.journalUrl, fingerprint: app.assessedFingerprint };
  } else {
    const inv = await runInvestigation({ actor, policy, identity: { title: c.title, altTitles: [], issn: c.issn, eissn: c.eissn, subjects: [], claimedIndexing: [], submittedWebsite: c.submittedUrl } });
    assessmentId = inv.assessmentId; journalS = inv.decision.journalStatus; destS = inv.decision.destinationStatus;
    if (c.stage === "PRE_SUBMISSION") {
      const adm = decideAdministrative({ stage: "PRE_SUBMISSION" as Stage, checklist: [], flags: [], adminRejected: false }, policy.config);
      adminS = adm.status; finalS = decideFinal(inv.decision, adm, policy.config).status;
    } else { adminS = "NOT_EVALUATED"; finalS = "NOT_EVALUATED"; }
  }
  const a = await loadAssessment(assessmentId);
  const evidenceSnapshot = (a?.evidence ?? []).map((e) => ({ id: e.id, key: e.key, status: e.status, integration: e.integration, severity: e.severity, source: e.sourceName, url: e.sourceUrl, ref: e.sourceRef, dataDate: e.sourceDataDate, retrievedAt: e.retrievedAt, review: e.review, fingerprint: e.fingerprint, demo: e.data?.demo === true }));
  officialHosts = ((a?.evidence.find((e) => e.key === "hijack.website")?.data.officialHosts as string[] | undefined) ?? []);
  const authenticHost = normalizeDestination(c.authenticUrl).host;
  const gen: Record<Dimension, GenStatus> = { journal: journalS, destination: destS, admin: adminS, final: finalS };
  const refMap: Record<Dimension, RefStatus> = { journal: ref.journalStatus as RefStatus, destination: ref.destinationStatus as RefStatus, admin: ref.adminStatus as RefStatus, final: ref.finalStatus as RefStatus };
  const cmp = compareAll(refMap, gen);
  const runNo = (await prisma.validationRun.count({ where: { caseId } })) + 1;
  const prev = opts.retestOfRunId ? await prisma.validationRun.findUnique({ where: { id: opts.retestOfRunId } }) : null;
  const run = await prisma.validationRun.create({
    data: {
      caseId, referenceId: ref.id, runNo, assessmentId, applicationId: c.applicationId, policyVersion: policy.version, policyHash: sha256(JSON.stringify(policy.config)).slice(0, 16), appVersion: appVersion(),
      applicationSnapshotJson: applicationSnapshot ? JSON.stringify(applicationSnapshot) : null, evidenceSnapshotJson: JSON.stringify(evidenceSnapshot),
      generatedJson: JSON.stringify({ ...gen, officialHosts, authenticUrlKnownToSystem: authenticHost ? officialHosts.includes(authenticHost) : null }), comparisonJson: JSON.stringify(cmp),
      agreement: cmp.agreement, safetyCritical: cmp.safetyCritical, discrepancyClass: null, retestOfRunId: prev?.id ?? null,
      retestOutcome: prev ? (cmp.agreement === "AGREE" ? "RESOLVED" : "STILL_DISAGREES") : null, runById: actor.id, runByName: actor.name,
    },
  });
  await prisma.validationCase.update({ where: { id: caseId }, data: { status: cmp.agreement === "DISAGREE" ? "DISCREPANCY_OPEN" : "RUN_COMPLETED" } });
  await audit(actor, "VALIDATION_RUN", "ValidationRun", run.id, { caseId, runNo, agreement: cmp.agreement, safetyCritical: cmp.safetyCritical, policyVersion: policy.version }, policy.version);
  return run;
}

export async function classifyRun(runId: string, input: { discrepancyClass: string; note: string; correctiveAction?: string }, actor: Actor & { role?: string }) {
  staff(actor);
  if (!DISCREPANCY_CLASSES.some((d) => d.code === input.discrepancyClass)) throw new ValidationError("Klasifikasi tidak valid.");
  if (input.note.trim().length < 10) throw new ValidationError("Catatan perbedaan minimal 10 karakter.");
  const run = await prisma.validationRun.findUniqueOrThrow({ where: { id: runId } });
  await prisma.validationRun.update({ where: { id: runId }, data: { discrepancyClass: input.discrepancyClass, discrepancyNote: input.note.trim(), correctiveAction: input.correctiveAction?.trim() || null, classifiedById: actor.id } });
  await audit(actor, "VALIDATION_CLASSIFIED", "ValidationRun", runId, { class: input.discrepancyClass, caseId: run.caseId });
}

export async function resolveCase(caseId: string, actor: Actor & { role?: string }) {
  staff(actor);
  const last = await prisma.validationRun.findFirst({ where: { caseId }, orderBy: { runNo: "desc" } });
  if (!last) throw new ValidationError("Belum ada proses.");
  if (last.agreement === "DISAGREE" && !last.discrepancyClass) throw new ValidationError("Klasifikasikan perbedaan terlebih dahulu.");
  await prisma.validationCase.update({ where: { id: caseId }, data: { status: "RESOLVED" } });
  await audit(actor, "VALIDATION_CASE_RESOLVED", "ValidationCase", caseId, {});
}

export async function coverageSummary() {
  const cases = await prisma.validationCase.findMany({ include: { runs: { orderBy: { runNo: "desc" } }, references: true } });
  return VALIDATION_CATEGORIES.map((cat) => {
    const real = cases.filter((c) => c.category === cat.code && !c.isFictionalFixture);
    const fict = cases.filter((c) => c.category === cat.code && c.isFictionalFixture);
    const realRun = real.filter((c) => c.runs.length > 0);
    return {
      ...cat, realCases: real.length, realWithReference: real.filter((c) => c.references.length).length, realRun: realRun.length,
      realAgree: realRun.filter((c) => c.runs[0].agreement === "AGREE").length, realDisagree: realRun.filter((c) => c.runs[0].agreement === "DISAGREE").length, fictionalFixtures: fict.length,
    };
  });
}

const esc = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

/** Ekspor CSV (satu baris per proses; riwayat dipertahankan). Default TANPA narasi; narasi hanya untuk HEAD (includeNarrative). */
export async function exportCsv(actor: Actor & { role?: string }, includeNarrative: boolean) {
  staff(actor);
  if (includeNarrative && actor.role !== "HEAD") throw new ValidationError("Ekspor dengan narasi/sumber hanya untuk Kepala Unit.");
  const cases = await prisma.validationCase.findMany({ include: { references: true, runs: { orderBy: { runNo: "asc" }, include: { reference: true } } }, orderBy: { caseCode: "asc" } });
  const head = ["confidentiality", "case_code", "category", "fictional_fixture", "case_status", "journal_title", "issn", "eissn", "submitted_url", "authentic_url", "stage", "pseudonym",
    "ref_version", "ref_journal", "ref_destination", "ref_admin", "ref_final", "ref_assessor", "ref_assessed_at", "ref_policy_version",
    "run_no", "run_at", "run_by", "app_journal", "app_destination", "app_admin", "app_final", "agreement", "safety_critical", "authentic_url_known_to_system", "discrepancy_class", "corrective_action", "retest_of_run", "retest_outcome",
    "run_policy_version", "run_policy_hash", "run_app_version", "evidence_snapshot_count", "assessment_id"];
  if (includeNarrative) head.push("ref_rationale", "ref_uncertainty", "ref_sources", "discrepancy_note", "case_notes");
  const rows: string[] = [head.join(",")];
  const conf = "INTERNAL-RAHASIA";
  for (const c of cases) {
    const base = [conf, c.caseCode, c.category, c.isFictionalFixture ? "FIKTIF" : "NYATA", c.status, c.title, c.issn, c.eissn, c.submittedUrl, c.authenticUrl, c.stage, c.pseudonym];
    const noRun = c.runs.length === 0;
    const items = noRun ? [null] : c.runs;
    for (const r of items) {
      const ref = r ? r.reference : c.references.sort((a, b) => b.version - a.version)[0];
      const gen = r ? parseJson<any>(r.generatedJson, {}) : {};
      const refCols = ref ? [ref.version, ref.journalStatus, ref.destinationStatus, ref.adminStatus, ref.finalStatus, ref.assessorName, ref.assessedAt.toISOString().slice(0, 10), ref.policyVersion] : ["", "", "", "", "", "", "", ""];
      const runCols = r ? [r.runNo, r.runAt.toISOString(), r.runByName, gen.journal, gen.destination, gen.admin, gen.final, r.agreement, r.safetyCritical ? "YA" : "tidak", gen.authenticUrlKnownToSystem == null ? "" : gen.authenticUrlKnownToSystem ? "ya" : "tidak", r.discrepancyClass, r.correctiveAction, r.retestOfRunId, r.retestOutcome, r.policyVersion, r.policyHash, r.appVersion, parseJson<any[]>(r.evidenceSnapshotJson, []).length, r.assessmentId]
        : ["", "", "", "", "", "", "", "BELUM DIJALANKAN", "", "", "", "", "", "", "", "", "", "", ""];
      const row = [...base, ...refCols, ...runCols];
      if (includeNarrative) row.push(ref?.rationale, ref?.uncertainty, ref?.sourcesJson, r?.discrepancyNote, c.notes);
      rows.push(row.map(esc).join(","));
    }
  }
  await audit(actor, "VALIDATION_EXPORT", "ValidationCase", null, { narrative: includeNarrative, rows: rows.length - 1, mode: getMode() });
  return rows.join("\n");
}
