import { prisma } from "../db";
import { checkApproval, canPerform, nextState, MIN_JUSTIFICATION, TERMINAL_STATES, type ReviewActionType, type Role, type WorkflowState } from "../engine/approval";
import { audit } from "./audit";
import { evaluateApplication, reassessApplicationJournal } from "./applications";
import { getActivePolicy } from "./policyService";
import { officialPolicyBlockReason } from "../mode";

export interface ActingUser { id: string; name: string; role: Role }

const ERR: Record<string, string> = {
  ROLE_NOT_ALLOWED: "Peran Anda tidak berwenang melakukan tindakan ini.",
  ALREADY_FINAL: "Permohonan sudah final (disetujui/ditolak).",
  IDENTITY_FRAUD_BLOCK: "Persetujuan diblokir: identitas jurnal/situs terbukti palsu. Tidak dapat di-override.",
  BLOCKED_NOT_OVERRIDABLE: "Persetujuan diblokir: hasil MERAH tidak dapat di-override menurut kebijakan aktif.",
  OVERRIDE_JUSTIFICATION_REQUIRED: `Rekomendasi bukan HIJAU: justifikasi tertulis minimal ${MIN_JUSTIFICATION} karakter wajib diisi untuk menyetujui.`,
  NO_DECISION: "Belum ada penilaian jurnal/tujuan yang berlaku untuk permohonan ini (jurnal atau tujuan berubah?). Lakukan penilaian ulang.",
  POLICY_NOT_CONFIGURED: "Kebijakan resmi belum dikonfigurasi. Persetujuan klirens resmi diblokir sampai pejabat berwenang menerbitkan kebijakan resmi.",
};

export class ActionError extends Error {}

/** Setiap tindakan mencatat pelaku, waktu, alasan, dan versi kebijakan. Hanya pejabat manusia yang dapat APPROVE/REJECT. */
export async function performReviewAction(opts: { applicationId: string; actor: ActingUser; action: ReviewActionType; rationale: string; requireGreen?: boolean }) {
  const { applicationId, actor, action } = opts;
  const rationale = opts.rationale.trim();
  if (!canPerform(actor.role, action)) throw new ActionError(ERR.ROLE_NOT_ALLOWED);
  if (rationale.length < 10) throw new ActionError("Alasan/rasional minimal 10 karakter wajib diisi.");
  let app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  const from = app.workflow as WorkflowState;
  if (TERMINAL_STATES.includes(from)) throw new ActionError(ERR.ALREADY_FINAL);
  // Keputusan akhir selalu memakai penilaian jurnal yang DIVALIDASI ULANG saat ini, agar bukti/konfirmasi yang masuk
  // setelah penilaian lama (mis. klon dikonfirmasi) tidak terlewat. Hanya untuk pejabat yang berwenang menyetujui.
  if (action === "APPROVE" && canPerform(actor.role, "APPROVE")) {
    await reassessApplicationJournal(applicationId, actor);
    app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  }
  const policy = await getActivePolicy();
  const evaln = await evaluateApplication(app);
  let overrideJson: string | null = null;
  const data: Record<string, unknown> = {};

  if (action === "APPROVE") {
    // Persetujuan sekaligus: hanya bila penilaian ulang saat ini sepenuhnya HIJAU (tidak pernah override).
    if (opts.requireGreen && !(evaln.final && evaln.final.status === "GREEN" && evaln.final.journalStatus === "GREEN" && evaln.final.destinationStatus === "GREEN" && evaln.final.administrativeStatus === "GREEN" && !evaln.final.hardBlock && !evaln.final.clearanceBlocked)) {
      throw new ActionError("Tidak lagi bersih pada penilaian ulang; tinjau satu per satu.");
    }
    const c = checkApproval({ role: actor.role, state: from, final: evaln.final, justification: rationale, officialPolicyConfigured: !officialPolicyBlockReason(policy) });
    if (!c.ok) throw new ActionError(ERR[c.error!] ?? "Persetujuan ditolak");
    if (c.isOverride) {
      overrideJson = JSON.stringify({ by: actor.name, at: new Date().toISOString(), justification: rationale, finalStatus: evaln.final!.status, journalStatus: evaln.final!.journalStatus, administrativeStatus: evaln.final!.administrativeStatus, policyVersion: policy.version });
      data.overrideJson = overrideJson;
    }
    data.decidedAt = new Date();
  }
  if (action === "REJECT") {
    data.adminRejected = true; // penolakan administratif terdokumentasi; tidak menyiratkan jurnal curang
    data.decidedAt = new Date();
  }
  if (action === "RECOMMEND_APPROVE" || action === "RECOMMEND_REJECT") data.recommendation = action;
  if (action === "REASSESS") await reassessApplicationJournal(applicationId, actor);

  const to = nextState(action, from);
  await prisma.application.update({ where: { id: applicationId }, data: { workflow: to, ...data } });
  const row = await prisma.reviewAction.create({
    data: { applicationId, action, actorId: actor.id, rationale, policyVersion: policy.version, fromState: from, toState: to },
  });
  await audit(actor, `REVIEW_${action}`, "Application", applicationId, { from, to, rationale, override: !!overrideJson }, policy.version);
  return row;
}

const BATCH_STATES: WorkflowState[] = ["PENDING_REVIEW", "IN_REVIEW", "RECOMMENDED"];

/**
 * Persetujuan sekaligus oleh Kepala Unit untuk kasus BERSIH. Setiap permohonan tetap melewati performReviewAction
 * (peran, kebijakan resmi, penilaian ulang, audit per permohonan); yang tidak lagi bersih dilewati dengan alasan.
 */
export async function batchApproveClean(ids: string[], actor: ActingUser) {
  if (!canPerform(actor.role, "APPROVE")) throw new ActionError(ERR.ROLE_NOT_ALLOWED);
  const approved: string[] = [];
  const skipped: Array<{ ref: string; reason: string }> = [];
  for (const id of [...new Set(ids)].slice(0, 100)) {
    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) continue;
    if (!BATCH_STATES.includes(app.workflow as WorkflowState)) { skipped.push({ ref: app.refNumber, reason: `status alur ${app.workflow} tidak termasuk persetujuan sekaligus` }); continue; }
    try {
      await performReviewAction({ applicationId: id, actor, action: "APPROVE", requireGreen: true, rationale: "Persetujuan sekaligus: hasil akhir HIJAU (jurnal, tujuan, administratif) pada penilaian ulang; tanpa konflik atau catatan perhatian." });
      approved.push(app.refNumber);
    } catch (e: any) { skipped.push({ ref: app.refNumber, reason: String(e?.message ?? e).slice(0, 140) }); }
  }
  await audit(actor, "REVIEW_BATCH_APPROVE", "Application", null, { approved, skipped });
  return { approved, skipped };
}
