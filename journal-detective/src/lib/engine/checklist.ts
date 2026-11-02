import type { ChecklistState, DocType, PolicyConfig, Stage } from "./types";

/** Dokumen yang relevan untuk tahap tertentu (hanya bukti yang secara logis sudah ada). */
export function requiredDocsFor(stage: Stage, policy: PolicyConfig): DocType[] {
  return policy.requiredDocuments[stage] ?? [];
}

export function emptyChecklist(stage: Stage, policy: PolicyConfig): ChecklistState[] {
  return requiredDocsFor(stage, policy).map((docType) => ({ docType, status: "UNVERIFIED" as const }));
}
