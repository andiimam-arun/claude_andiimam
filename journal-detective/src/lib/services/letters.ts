import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { checkOfficialIssuance, type Role, type WorkflowState } from "../engine/approval";
import type { JournalDecision, Stage } from "../engine/types";
import { parseJson } from "../engine/util";
import { audit } from "./audit";
import { evaluateApplication } from "./applications";
import { getActivePolicy } from "./policyService";
import { getBranding, getTemplates } from "./settings";
import { t, reasonText } from "../i18n";

export type LetterType = "PRE_SUBMISSION" | "POST_ACCEPTANCE_PAYMENT";
export interface Actor { id: string; name: string; role: Role }

export interface LetterSnapshot {
  type: LetterType;
  title: string;
  opening: string;
  approvalStatement: string;
  closing: string;
  student: { name: string; number: string; program: string; supervisor: string };
  manuscript: { title: string; stage: string; trackingId: string | null };
  journal: { title: string; issn: string | null; eissn: string | null; publisher: string | null; verifiedWebsites: string[]; submittedWebsite: string | null };
  indexingAssessment: string;
  conclusions: string[];
  statuses: { journal: string; administrative: string; final: string };
  assessmentRef: string;
  assessmentDate: string;
  policyVersion: number;
  policyIsDemo: boolean;
  override: { justification: string } | null;
  branding: Awaited<ReturnType<typeof getBranding>>;
}

const POST_STAGES: Stage[] = ["ACCEPTED", "PAYMENT_REQUESTED", "PUBLISHED"];

export async function buildSnapshot(applicationId: string, type: LetterType): Promise<LetterSnapshot> {
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, include: { journal: true, assessment: true } });
  if (type === "POST_ACCEPTANCE_PAYMENT" && !POST_STAGES.includes(app.stage as Stage)) throw new Error("Surat pasca-penerimaan hanya untuk naskah yang telah diterima.");
  const [policy, tpl, branding, evaln] = await Promise.all([getActivePolicy(), getTemplates(), getBranding(), evaluateApplication(app)]);
  const jd = (app.assessment ? parseJson<JournalDecision | null>(app.assessment.decisionJson, null) : null);
  const tp = tpl[type];
  const rep = (s: string) => s.replace(/\{\{policyVersion\}\}/g, String(policy.version));
  const verified = parseJson<string[]>(app.journal?.verifiedDomainsJson, []);
  const conclusions = [
    ...(evaln.journal?.reasons ?? []).filter((r) => r.level !== "INFO").slice(0, 8).map((r) => `${t("id", `status.${r.level}`)}: ${reasonText("id", r)}`),
    ...evaln.administrative.reasons.filter((r) => r.level !== "INFO").map((r) => `${t("id", `status.${r.level}`)}: ${reasonText("id", r)}`),
  ];
  const ov = app.overrideJson ? parseJson<{ justification: string }>(app.overrideJson, { justification: "" }) : null;
  return {
    type, title: tp.title, opening: tp.opening, approvalStatement: rep(tp.approval), closing: tp.closing,
    student: { name: app.studentName, number: app.studentNumber, program: app.studyProgram, supervisor: app.supervisor },
    manuscript: { title: app.manuscriptTitle, stage: t("id", `stage.${app.stage}`), trackingId: app.trackingId },
    journal: { title: app.journal?.title ?? app.journalName, issn: app.journal?.issn ?? null, eissn: app.journal?.eissn ?? null, publisher: app.journal?.publisher ?? app.journalPublisher, verifiedWebsites: verified, submittedWebsite: app.journalUrl },
    indexingAssessment: jd
      ? `${t("id", `idx.${jd.indexingStatus}`)}${jd.indexingBasis ? ` — basis: ${t("id", `integ.${jd.indexingBasis}`)}` : ""}${jd.indexingDataDate ? `, tanggal data ${jd.indexingDataDate.slice(0, 10)}` : ""}`
      : "Belum dinilai",
    conclusions,
    statuses: {
      journal: jd ? `${t("id", `status.${jd.journalStatus}`)} — ${t("id", `status.${jd.journalStatus}.long`)}` : "-",
      administrative: `${t("id", `status.${evaln.administrative.status}`)}`,
      final: evaln.final ? `${t("id", `status.${evaln.final.status}`)} — ${t("id", `status.${evaln.final.status}.app`)}` : "-",
    },
    assessmentRef: app.assessment?.refNumber ?? "-", assessmentDate: (app.assessment?.createdAt ?? new Date()).toISOString().slice(0, 10),
    policyVersion: policy.version, policyIsDemo: policy.isDemo, override: ov ? { justification: ov.justification } : null, branding,
  };
}

/** Draf boleh dibuat oleh peninjau/kepala/administrator; selalu berwatermark DRAF sampai diterbitkan pejabat. */
export async function createOrRefreshDraft(applicationId: string, type: LetterType, actor: Actor) {
  const existing = await prisma.letter.findFirst({ where: { applicationId, type, status: "DRAFT" } });
  const snap = await buildSnapshot(applicationId, type);
  const policy = await getActivePolicy();
  if (existing) {
    await prisma.letter.update({ where: { id: existing.id }, data: { snapshotJson: JSON.stringify(snap), policyVersion: policy.version } });
    return existing.id;
  }
  const l = await prisma.letter.create({
    data: { applicationId, type, status: "DRAFT", verifyToken: randomBytes(18).toString("base64url"), snapshotJson: JSON.stringify(snap), policyVersion: policy.version, createdById: actor.id },
  });
  await audit(actor, "LETTER_DRAFT_CREATED", "Letter", l.id, { applicationId, type }, policy.version);
  return l.id;
}

export class IssueError extends Error {}

/**
 * Penerbitan surat resmi: HANYA Kepala Unit, setelah permohonan berstatus APPROVED, dengan nomor surat resmi yang dimasukkan manusia.
 * Sistem tidak pernah mengarang nomor surat, tanda tangan, atau persetujuan.
 */
export async function issueLetter(letterId: string, actor: Actor, officialNumber: string) {
  const letter = await prisma.letter.findUniqueOrThrow({ where: { id: letterId }, include: { application: true } });
  if (letter.status !== "DRAFT") throw new IssueError("Surat bukan berstatus draf.");
  const evaln = await evaluateApplication(letter.application);
  const c = checkOfficialIssuance({
    role: actor.role, state: letter.application.workflow as WorkflowState, final: evaln.final, officialNumber, isOverrideApproved: !!letter.application.overrideJson,
  });
  if (!c.ok) {
    const msg: Record<string, string> = {
      ROLE_NOT_ALLOWED: "Hanya Kepala Unit Publikasi yang dapat menerbitkan surat resmi. Peran Anda hanya dapat membuat draf berwatermark.",
      NOT_APPROVED: "Surat resmi hanya dapat diterbitkan setelah persetujuan institusional oleh pejabat berwenang.",
      BLOCKED: "Klirens diblokir (hasil MERAH); surat resmi tidak dapat diterbitkan.",
      NUMBER_REQUIRED: "Nomor surat resmi wajib dimasukkan oleh pejabat berwenang; sistem tidak membuat nomor surat.",
    };
    await audit(actor, "LETTER_ISSUE_DENIED", "Letter", letterId, { reason: c.error });
    throw new IssueError(msg[c.error!]);
  }
  const dup = await prisma.letter.findFirst({ where: { officialNumber: officialNumber.trim(), status: "ISSUED" } });
  if (dup) throw new IssueError("Nomor surat tersebut sudah dipakai pada surat lain.");
  const snap = await buildSnapshot(letter.applicationId, letter.type as LetterType);
  const branding = snap.branding;
  const policy = await getActivePolicy();
  const updated = await prisma.letter.update({
    where: { id: letterId },
    data: {
      status: "ISSUED", officialNumber: officialNumber.trim(), approverId: actor.id, approverName: actor.name, approverTitle: branding.approverTitle,
      approvedAt: new Date(), snapshotJson: JSON.stringify(snap), policyVersion: policy.version,
    },
  });
  await audit(actor, "LETTER_ISSUED", "Letter", letterId, { number: officialNumber.trim(), applicationId: letter.applicationId }, policy.version);
  return updated;
}

export async function revokeLetter(letterId: string, actor: Actor, reason: string) {
  if (actor.role !== "HEAD") throw new IssueError("Hanya Kepala Unit yang dapat mencabut surat.");
  if (reason.trim().length < 10) throw new IssueError("Alasan pencabutan minimal 10 karakter.");
  await prisma.letter.update({ where: { id: letterId }, data: { status: "REVOKED" } });
  await audit(actor, "LETTER_REVOKED", "Letter", letterId, { reason });
}

/** Informasi minimum publik untuk verifikasi QR. Draf tidak pernah terbuka. */
export async function publicVerification(token: string) {
  const l = await prisma.letter.findUnique({ where: { verifyToken: token }, include: { application: true } });
  if (!l || l.status === "DRAFT") return null;
  const snap = parseJson<LetterSnapshot | null>(l.snapshotJson, null);
  const name = l.application.studentName.split(/\s+/).map((p, i) => (i === 0 ? p : p[0] + "***")).join(" ");
  return {
    status: l.status as "ISSUED" | "REVOKED", type: l.type as LetterType, officialNumber: l.officialNumber, issuedAt: l.approvedAt, studentMasked: name,
    journalTitle: snap?.journal.title ?? l.application.journalName, issuer: snap ? `${snap.branding.unit}, ${snap.branding.faculty}, ${snap.branding.institution}` : "", demo: snap?.policyIsDemo ?? false,
  };
}
