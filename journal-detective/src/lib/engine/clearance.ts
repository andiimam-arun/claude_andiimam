import type {
  AdministrativeDecision, AdministrativeInput, DocType, FinalDecision, JournalDecision, PolicyConfig, Reason, TrafficLight,
} from "./types";

/** Dimensi B — klirens administratif naskah. Hanya mengevaluasi dokumen yang relevan untuk tahap yang diklaim. */
export function decideAdministrative(input: AdministrativeInput, policy: PolicyConfig): AdministrativeDecision {
  const required = policy.requiredDocuments[input.stage] ?? [];
  const reasons: Reason[] = [];
  const missingDocs: DocType[] = [];
  const unverifiedDocs: DocType[] = [];
  const unmetDocs: DocType[] = [];

  for (const d of required) {
    const item = input.checklist.find((c) => c.docType === d);
    if (!item) missingDocs.push(d);
    else if (item.status === "UNVERIFIED") unverifiedDocs.push(d);
    else if (item.status === "UNMET") unmetDocs.push(d);
  }

  let status: TrafficLight = "GREEN";
  const confirmedSerious = input.flags.filter((f) => f.state === "CONFIRMED" && (f.severity === "MEDIUM" || f.severity === "HIGH"));
  const openFlags = input.flags.filter((f) => f.state === "OPEN" && f.severity !== "INFO");

  if (input.adminRejected) {
    status = "RED";
    reasons.push({ code: "admin_rejected", level: "RED" });
  }
  if (confirmedSerious.length) {
    status = "RED";
    reasons.push({ code: "admin_confirmed_flag", level: "RED", params: { n: confirmedSerious.length } });
  }
  if (missingDocs.length) {
    if (status !== "RED") status = "YELLOW";
    reasons.push({ code: "admin_docs_missing", level: "YELLOW", params: { docs: missingDocs.join(", ") } });
  }
  if (unverifiedDocs.length) {
    if (status !== "RED") status = "YELLOW";
    reasons.push({ code: "admin_docs_unverified", level: "YELLOW", params: { docs: unverifiedDocs.join(", ") } });
  }
  if (unmetDocs.length) {
    if (status !== "RED") status = "YELLOW";
    reasons.push({ code: "admin_docs_unmet", level: "YELLOW", params: { docs: unmetDocs.join(", ") } });
  }
  if (openFlags.length) {
    if (status !== "RED") status = "YELLOW";
    reasons.push({ code: "admin_open_flags", level: "YELLOW", params: { n: openFlags.length } });
  }
  if (required.length === 0 && status === "GREEN") reasons.push({ code: "admin_no_stage_evidence_required", level: "INFO" });
  else if (status === "GREEN") reasons.push({ code: "admin_all_docs_verified", level: "GREEN" });

  return { status, reasons, missingDocs, unverifiedDocs, unmetDocs };
}

/**
 * Rekomendasi akhir dari DUA dimensi. ATURAN KRITIS: dokumen pengiriman/penerimaan/pembayaran yang valid
 * tidak pernah mengesampingkan pemalsuan identitas jurnal yang terkonfirmasi.
 */
export function decideFinal(journal: JournalDecision, admin: AdministrativeDecision, policy: PolicyConfig): FinalDecision {
  const reasons: Reason[] = [];
  const hardBlock = journal.identityFraudBlock;
  const criticalJournal = journal.journalStatus === "RED" && journal.redCategory === "CRITICAL_INTEGRITY";
  const policyRed = journal.journalStatus === "RED" && journal.redCategory === "POLICY_INELIGIBLE";
  const destRed = journal.destinationStatus === "RED";
  const blocked = journal.journalStatus === "RED" || destRed || admin.status === "RED";

  if (hardBlock) reasons.push({ code: "final_identity_override", level: "RED" });
  else if (criticalJournal) reasons.push({ code: "final_journal_critical", level: "RED" });
  else if (policyRed) reasons.push({ code: "final_policy_ineligible", level: "RED" });
  if (admin.status === "RED") reasons.push({ code: "final_admin_red", level: "RED" });

  let status: TrafficLight = "GREEN";
  if (blocked) status = "RED";
  else if (journal.journalStatus === "YELLOW" || journal.destinationStatus === "YELLOW" || admin.status === "YELLOW") {
    status = "YELLOW";
    if (journal.destinationStatus === "YELLOW") reasons.push({ code: "final_destination_yellow", level: "YELLOW" });
    if (journal.journalStatus === "YELLOW") reasons.push({ code: "final_journal_yellow", level: "YELLOW" });
    if (admin.status === "YELLOW") reasons.push({ code: "final_admin_yellow", level: "YELLOW" });
  } else reasons.push({ code: "final_all_green", level: "GREEN" });

  const overridableByHead = !hardBlock && !criticalJournal && admin.status !== "RED" && (!policyRed || policy.headMayOverridePolicyIneligible);

  return {
    status, journalStatus: journal.journalStatus, destinationStatus: journal.destinationStatus, administrativeStatus: admin.status,
    clearanceBlocked: blocked, hardBlock, overridableByHead, reasons,
  };
}
