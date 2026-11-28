import type { FinalDecision } from "./types";

export type Role = "STUDENT" | "REVIEWER" | "HEAD" | "ADMIN";
export const ROLES: Role[] = ["STUDENT", "REVIEWER", "HEAD", "ADMIN"];

export type ReviewActionType =
  | "START_REVIEW"
  | "APPROVE"
  | "REQUEST_EVIDENCE"
  | "RETURN_FOR_REVISION"
  | "REJECT"
  | "REASSESS"
  | "ESCALATE"
  | "RECOMMEND_APPROVE"
  | "RECOMMEND_REJECT";

export type WorkflowState =
  | "PENDING_REVIEW"
  | "IN_REVIEW"
  | "NEEDS_EVIDENCE"
  | "RETURNED"
  | "ESCALATED"
  | "RECOMMENDED"
  | "APPROVED"
  | "REJECTED";

export const TERMINAL_STATES: WorkflowState[] = ["APPROVED", "REJECTED"];

/** Hanya pejabat manusia berwenang yang dapat menerbitkan persetujuan institusional (APPROVE/REJECT). */
export const ACTION_ROLES: Record<ReviewActionType, Role[]> = {
  START_REVIEW: ["REVIEWER", "HEAD"],
  APPROVE: ["HEAD"],
  REJECT: ["HEAD"],
  REQUEST_EVIDENCE: ["REVIEWER", "HEAD"],
  RETURN_FOR_REVISION: ["REVIEWER", "HEAD"],
  REASSESS: ["REVIEWER", "HEAD"],
  ESCALATE: ["REVIEWER", "HEAD"],
  RECOMMEND_APPROVE: ["REVIEWER"],
  RECOMMEND_REJECT: ["REVIEWER"],
};

export function canPerform(role: Role, action: ReviewActionType): boolean {
  return ACTION_ROLES[action].includes(role);
}

export function nextState(action: ReviewActionType, from: WorkflowState): WorkflowState {
  switch (action) {
    case "START_REVIEW": return "IN_REVIEW";
    case "APPROVE": return "APPROVED";
    case "REJECT": return "REJECTED";
    case "REQUEST_EVIDENCE": return "NEEDS_EVIDENCE";
    case "RETURN_FOR_REVISION": return "RETURNED";
    case "ESCALATE": return "ESCALATED";
    case "RECOMMEND_APPROVE":
    case "RECOMMEND_REJECT": return "RECOMMENDED";
    case "REASSESS": return from === "PENDING_REVIEW" ? "IN_REVIEW" : from;
  }
}

export interface ApprovalCheck {
  ok: boolean;
  error?: "ROLE_NOT_ALLOWED" | "POLICY_NOT_CONFIGURED" | "ALREADY_FINAL" | "IDENTITY_FRAUD_BLOCK" | "BLOCKED_NOT_OVERRIDABLE" | "OVERRIDE_JUSTIFICATION_REQUIRED" | "NO_DECISION";
  isOverride: boolean;
}

export const MIN_JUSTIFICATION = 20;

/** Aturan persetujuan institusional. Pemblokiran identitas palsu terkonfirmasi TIDAK dapat di-override siapa pun. */
export function checkApproval(opts: { role: Role; state: WorkflowState; final: FinalDecision | null; justification?: string; officialPolicyConfigured?: boolean }): ApprovalCheck {
  if (!canPerform(opts.role, "APPROVE")) return { ok: false, error: "ROLE_NOT_ALLOWED", isOverride: false };
  if (opts.officialPolicyConfigured === false) return { ok: false, error: "POLICY_NOT_CONFIGURED", isOverride: false };
  if (TERMINAL_STATES.includes(opts.state)) return { ok: false, error: "ALREADY_FINAL", isOverride: false };
  if (!opts.final) return { ok: false, error: "NO_DECISION", isOverride: false };
  if (opts.final.hardBlock) return { ok: false, error: "IDENTITY_FRAUD_BLOCK", isOverride: false };
  if (opts.final.clearanceBlocked && !opts.final.overridableByHead) return { ok: false, error: "BLOCKED_NOT_OVERRIDABLE", isOverride: false };
  const needsOverride = opts.final.status !== "GREEN";
  if (needsOverride && (opts.justification ?? "").trim().length < MIN_JUSTIFICATION) {
    return { ok: false, error: "OVERRIDE_JUSTIFICATION_REQUIRED", isOverride: true };
  }
  return { ok: true, isOverride: needsOverride };
}

export interface IssueCheck {
  ok: boolean;
  error?: "ROLE_NOT_ALLOWED" | "POLICY_NOT_CONFIGURED" | "NOT_APPROVED" | "BLOCKED" | "NUMBER_REQUIRED";
}

/**
 * Surat resmi hanya boleh diterbitkan oleh Kepala Unit setelah persetujuan manusia.
 * Administrator TIDAK dapat menerbitkan surat resmi; ia hanya dapat membuat draf berwatermark.
 */
export function checkOfficialIssuance(opts: { role: Role; state: WorkflowState; final: FinalDecision | null; officialNumber?: string | null; isOverrideApproved?: boolean; officialPolicyConfigured?: boolean }): IssueCheck {
  if (opts.role !== "HEAD") return { ok: false, error: "ROLE_NOT_ALLOWED" };
  if (opts.officialPolicyConfigured === false) return { ok: false, error: "POLICY_NOT_CONFIGURED" };
  if (opts.state !== "APPROVED") return { ok: false, error: "NOT_APPROVED" };
  if (opts.final?.hardBlock) return { ok: false, error: "BLOCKED" };
  if (opts.final?.clearanceBlocked && !opts.isOverrideApproved) return { ok: false, error: "BLOCKED" };
  if (!(opts.officialNumber ?? "").trim()) return { ok: false, error: "NUMBER_REQUIRED" };
  return { ok: true };
}
