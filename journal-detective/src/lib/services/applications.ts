import { prisma } from "../db";
import type { Application } from "@prisma/client";
import { z } from "zod";
import { decideAdministrative, decideFinal } from "../engine/clearance";
import { detectProcessAnomalies } from "../engine/anomalies";
import { detectDocumentInconsistencies } from "../engine/consistency";
import { STAGES, type AdministrativeDecision, type DocType, type FinalDecision, type JournalDecision, type Stage } from "../engine/types";
import { normalizeIssn } from "../engine/issn";
import { parseJson } from "../engine/util";
import { registrableDomain } from "../engine/domain";
import { audit, type Actor } from "./audit";
import { getActivePolicy } from "./policyService";
import { runInvestigation } from "./investigation";
import { requiredDocsFor } from "../engine/checklist";
import { normalizeDestination } from "../engine/domain";
import { normalizeTitle, sha256 } from "../engine/util";

export const applicationSchema = z.object({
  studentName: z.string().trim().min(3).max(120),
  studentNumber: z.string().trim().min(5).max(30),
  studyProgram: z.string().trim().min(2).max(120),
  supervisor: z.string().trim().min(3).max(120),
  studentEmail: z.string().trim().email().max(160),
  manuscriptTitle: z.string().trim().min(8).max(400),
  researchField: z.string().trim().min(2).max(160),
  stage: z.enum(STAGES),
  submissionDate: z.string().optional().nullable(),
  trackingId: z.string().trim().max(80).optional().nullable(),
  journalUrl: z.string().trim().url().max(400).optional().or(z.literal("")),
  articleDoi: z.string().trim().max(200).optional().nullable(),
  articleUrl: z.string().trim().max(400).optional().nullable(),
  journalName: z.string().trim().min(3).max(300),
  journalIssn: z.string().trim().max(40).optional().nullable(),
  journalPublisher: z.string().trim().max(200).optional().nullable(),
  claimedIndexing: z.string().trim().max(300).optional().nullable(),
  claimedQuartile: z.string().trim().max(10).optional().nullable(),
});
export type ApplicationForm = z.infer<typeof applicationSchema>;

/** Sidik jari identitas jurnal + tujuan persis yang dinilai. Berubah → rekomendasi lama tidak berlaku. */
export function assessmentFingerprint(a: { journalName: string; journalIssn?: string | null; journalUrl?: string | null; claimedIndexing?: string | null }): string {
  const issns = (a.journalIssn ?? "").split(/[\s,;/]+/).map((x) => normalizeIssn(x)).filter(Boolean).sort().join(",");
  const host = normalizeDestination(a.journalUrl).host ?? "";
  return sha256(`${normalizeTitle(a.journalName)}|${issns}|${host}|${(a.claimedIndexing ?? "").toLowerCase().replace(/\s+/g, "")}`).slice(0, 24);
}

function splitIssns(raw?: string | null) {
  const parts = (raw ?? "").split(/[\s,;/]+/).map((s) => normalizeIssn(s)).filter(Boolean) as string[];
  return { issn: parts[0] ?? null, eissn: parts[1] ?? null, raw: (raw ?? "").trim() };
}

export async function createApplication(form: ApplicationForm, actor: Actor & { id: string }, studentUserId: string | null) {
  const policy = await getActivePolicy();
  const { issn, eissn, raw } = splitIssns(form.journalIssn);
  const claimed = (form.claimedIndexing ?? "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const inv = await runInvestigation({
    actor, policy,
    identity: {
      title: form.journalName, altTitles: [], issn: issn ?? (raw && !issn ? raw : null), eissn, publisher: form.journalPublisher, subjects: [form.researchField],
      claimedIndexing: claimed, claimedQuartile: form.claimedQuartile, submittedWebsite: form.journalUrl || null,
    },
  });
  const count = await prisma.application.count();
  const app = await prisma.application.create({
    data: {
      refNumber: `PK-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`, studentUserId, studentName: form.studentName, studentNumber: form.studentNumber,
      studyProgram: form.studyProgram, supervisor: form.supervisor, studentEmail: form.studentEmail, manuscriptTitle: form.manuscriptTitle, researchField: form.researchField,
      stage: form.stage, submissionDate: form.submissionDate ? new Date(form.submissionDate) : null, trackingId: form.trackingId || null, journalUrl: form.journalUrl || null,
      articleDoi: form.articleDoi || null, articleUrl: form.articleUrl || null, journalName: form.journalName, journalIssn: form.journalIssn || null, journalPublisher: form.journalPublisher || null,
      claimedIndexing: form.claimedIndexing || null, claimedQuartile: form.claimedQuartile || null, journalId: inv.journalId, assessmentId: inv.assessmentId, destinationHost: normalizeDestination(form.journalUrl).host,
      assessedFingerprint: assessmentFingerprint({ journalName: form.journalName, journalIssn: form.journalIssn, journalUrl: form.journalUrl, claimedIndexing: form.claimedIndexing }),
    },
  });
  if (form.submissionDate && form.stage !== "PRE_SUBMISSION") {
    await prisma.manuscriptEvent.create({ data: { applicationId: app.id, type: "SUBMITTED", occurredAt: new Date(form.submissionDate), note: "Dari formulir permohonan", createdById: actor.id } });
  }
  await syncChecklist(app.id, form.stage as Stage);
  await audit(actor, "APPLICATION_CREATED", "Application", app.id, { stage: form.stage, journalId: inv.journalId }, policy.version);
  await refreshFlags(app.id);
  return app;
}

export async function syncChecklist(applicationId: string, stage: Stage) {
  const policy = await getActivePolicy();
  for (const d of requiredDocsFor(stage, policy.config)) {
    await prisma.checklistItem.upsert({ where: { applicationId_docType: { applicationId, docType: d } }, create: { applicationId, docType: d, status: "UNVERIFIED" }, update: {} });
  }
}

export async function updateStage(applicationId: string, stage: Stage, actor: Actor) {
  const app = await prisma.application.update({ where: { id: applicationId }, data: { stage } });
  await syncChecklist(applicationId, stage);
  await audit(actor, "STAGE_CHANGED", "Application", applicationId, { stage });
  await refreshFlags(applicationId);
  return app;
}

export async function addEvent(applicationId: string, e: { type: string; occurredAt: string; note?: string }, actor: Actor) {
  await prisma.manuscriptEvent.create({ data: { applicationId, type: e.type, occurredAt: new Date(e.occurredAt), note: e.note || null, createdById: actor.id } });
  await audit(actor, "EVENT_ADDED", "Application", applicationId, e);
  await refreshFlags(applicationId);
}

export async function setChecklist(applicationId: string, docType: DocType, status: "UNVERIFIED" | "MET" | "UNMET" | "NOT_APPLICABLE", note: string | null, actor: Actor) {
  await prisma.checklistItem.upsert({
    where: { applicationId_docType: { applicationId, docType } }, create: { applicationId, docType, status, note, reviewedById: actor.id }, update: { status, note, reviewedById: actor.id },
  });
  await audit(actor, "CHECKLIST_SET", "Application", applicationId, { docType, status, note });
}

export async function resolveFlag(flagId: string, state: "CONFIRMED" | "DISMISSED" | "OPEN", note: string, actor: Actor) {
  if (state !== "OPEN" && note.trim().length < 10) throw new Error("Catatan minimal 10 karakter");
  const f = await prisma.consistencyFlag.update({ where: { id: flagId }, data: { state, note, resolvedById: actor.id } });
  await audit(actor, "FLAG_RESOLVED", "Application", f.applicationId, { flagId, state, code: f.code, note });
}

/** Menghitung ulang tanda otomatis (anomali proses & ketidakkonsistenan dokumen). Tanda yang sudah ditinjau dipertahankan. */
export async function refreshFlags(applicationId: string) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { events: true, documents: true, journal: true } });
  if (!app) return;
  const policy = await getActivePolicy();
  const verifiedDomains = parseJson<string[]>(app.journal?.verifiedDomainsJson, []);
  const issns = [app.journal?.issn, app.journal?.eissn, ...(app.journalIssn ?? "").split(/[\s,;/]+/)].filter(Boolean) as string[];
  const detected = [
    ...detectProcessAnomalies(app.events.map((e) => ({ type: e.type, occurredAt: e.occurredAt })), policy.config.fastAcceptanceWarnDays).map((f) => ({ ...f, documentId: undefined as string | undefined })),
    ...detectDocumentInconsistencies(
      { manuscriptTitle: app.manuscriptTitle, journalName: app.journalName, journalIssns: issns, trackingId: app.trackingId, journalDomains: verifiedDomains.length ? verifiedDomains : [], submissionDate: app.submissionDate?.toISOString() ?? null },
      app.documents.map((d) => ({ id: d.id, docType: d.docType, filename: d.filename, fields: parseJson(d.fieldsJson, {}) })),
    ),
  ];
  const existing = await prisma.consistencyFlag.findMany({ where: { applicationId } });
  const key = (f: { code: string; message: string; documentId?: string | null }) => `${f.code}|${f.documentId ?? ""}|${f.message}`;
  const detectedKeys = new Set(detected.map(key));
  for (const e of existing) if (e.state === "OPEN" && !detectedKeys.has(key(e))) await prisma.consistencyFlag.delete({ where: { id: e.id } });
  const have = new Set(existing.map(key));
  for (const f of detected) if (!have.has(key(f))) await prisma.consistencyFlag.create({ data: { applicationId, code: f.code, message: f.message, severity: f.severity, documentId: f.documentId ?? null } });
}

export interface ApplicationEvaluation {
  /** True bila jurnal/tujuan pada permohonan berubah setelah penilaian terakhir: rekomendasi lama TIDAK berlaku sampai dinilai ulang. */
  invalidated: boolean;
  journal: JournalDecision | null;
  administrative: AdministrativeDecision;
  final: FinalDecision | null;
  policyVersion: number;
}

export async function evaluateApplication(app: Application): Promise<ApplicationEvaluation> {
  const policy = await getActivePolicy();
  const [assessment, checklist, flags] = await Promise.all([
    app.assessmentId ? prisma.assessment.findUnique({ where: { id: app.assessmentId } }) : null,
    prisma.checklistItem.findMany({ where: { applicationId: app.id } }),
    prisma.consistencyFlag.findMany({ where: { applicationId: app.id } }),
  ]);
  const invalidated = !!(assessment && app.assessedFingerprint && app.assessedFingerprint !== assessmentFingerprint(app));
  const journal = assessment && !invalidated ? parseJson<JournalDecision | null>(assessment.decisionJson, null) : null;
  const administrative = decideAdministrative(
    { stage: app.stage as Stage, checklist: checklist.map((c) => ({ docType: c.docType as DocType, status: c.status as any })), flags: flags.map((f) => ({ code: f.code, severity: f.severity as any, state: f.state as any })), adminRejected: app.adminRejected },
    policy.config,
  );
  return { invalidated, journal, administrative, final: journal ? decideFinal(journal, administrative, policy.config) : null, policyVersion: policy.version };
}

export async function reassessApplicationJournal(applicationId: string, actor: Actor) {
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  const { issn, eissn, raw } = splitIssns(app.journalIssn);
  const inv = await runInvestigation({
    actor,
    identity: {
      title: app.journalName, altTitles: [], issn: issn ?? (raw || null), eissn, publisher: app.journalPublisher, subjects: [app.researchField],
      claimedIndexing: (app.claimedIndexing ?? "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean), claimedQuartile: app.claimedQuartile, submittedWebsite: app.journalUrl,
    },
  });
  await prisma.application.update({
    where: { id: applicationId },
    data: { assessmentId: inv.assessmentId, journalId: inv.journalId, destinationHost: normalizeDestination(app.journalUrl).host, assessedFingerprint: assessmentFingerprint(app), invalidatedAt: null },
  });
  await refreshFlags(applicationId);
  return inv;
}

export const journalChangeSchema = z.object({
  journalName: z.string().trim().min(3).max(300),
  journalIssn: z.string().trim().max(40).optional().nullable(),
  journalPublisher: z.string().trim().max(200).optional().nullable(),
  journalUrl: z.string().trim().url().max(400).optional().or(z.literal("")),
  claimedIndexing: z.string().trim().max(300).optional().nullable(),
  claimedQuartile: z.string().trim().max(10).optional().nullable(),
});

/**
 * Mengubah jurnal/tujuan pada permohonan: rekomendasi lama DIBATALKAN (workflow kembali ke PENDING_REVIEW, rekomendasi peninjau dihapus,
 * riwayat dicatat), lalu penilaian baru dijalankan otomatis. Persetujuan harus diulang. Permohonan final tidak dapat diubah.
 */
export async function changeApplicationJournal(applicationId: string, input: z.infer<typeof journalChangeSchema>, actor: Actor & { id: string }) {
  const before = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (["APPROVED", "REJECTED"].includes(before.workflow)) throw new Error("Permohonan sudah final dan dikunci; tidak dapat diubah.");
  const v = journalChangeSchema.parse(input);
  const changed = assessmentFingerprint({ ...before }) !== assessmentFingerprint({ journalName: v.journalName, journalIssn: v.journalIssn, journalUrl: v.journalUrl, claimedIndexing: v.claimedIndexing });
  await prisma.application.update({
    where: { id: applicationId },
    data: { journalName: v.journalName, journalIssn: v.journalIssn || null, journalPublisher: v.journalPublisher || null, journalUrl: v.journalUrl || null, claimedIndexing: v.claimedIndexing || null, claimedQuartile: v.claimedQuartile || null },
  });
  if (!changed) return { changed: false };
  const policy = await getActivePolicy();
  await prisma.application.update({ where: { id: applicationId }, data: { recommendation: null, workflow: "PENDING_REVIEW", invalidatedAt: new Date() } });
  await prisma.reviewAction.create({
    data: {
      applicationId, action: "RECOMMENDATION_INVALIDATED", actorId: actor.id, policyVersion: policy.version, fromState: before.workflow, toState: "PENDING_REVIEW",
      rationale: `Jurnal/tujuan diubah: "${before.journalName}" ${before.journalUrl ?? "-"} → "${v.journalName}" ${v.journalUrl || "-"}. Rekomendasi dan persetujuan sebelumnya tidak berlaku; penilaian ulang dijalankan.`,
    },
  });
  await audit(actor, "APPLICATION_JOURNAL_CHANGED", "Application", applicationId, { from: { name: before.journalName, url: before.journalUrl, issn: before.journalIssn }, to: { name: v.journalName, url: v.journalUrl, issn: v.journalIssn } }, policy.version);
  await reassessApplicationJournal(applicationId, actor);
  return { changed: true };
}

export { registrableDomain };
