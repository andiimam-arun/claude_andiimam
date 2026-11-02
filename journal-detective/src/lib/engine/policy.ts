import { z } from "zod";
import { DOC_TYPES, STAGES, type PolicyConfig, type Stage, type DocType } from "./types";

/**
 * KEBIJAKAN DEMONSTRASI. Nilai-nilai ini BUKAN peraturan resmi fakultas manapun.
 * Pejabat berwenang harus memasukkan aturan resmi melalui Pengaturan → Kebijakan (versi baru).
 */
export const DEMO_POLICY: PolicyConfig = {
  requireCurrentScopus: true,
  discontinuedHandling: "INELIGIBLE",
  acceptNationalAccredited: false,
  acceptedAccreditationLevels: ["SINTA 1", "SINTA 2"],
  requiredQuartiles: [],
  quartileMandatory: false,
  maxIndexEvidenceAgeDays: 365,
  requiredDocuments: {
    PRE_SUBMISSION: [],
    SUBMITTED: ["SUBMISSION_ACK"],
    UNDER_REVIEW: ["SUBMISSION_ACK", "EDITORIAL_CORRESPONDENCE"],
    REVISION_REQUESTED: ["SUBMISSION_ACK", "REVIEWER_COMMENTS"],
    REVISED_SUBMITTED: ["SUBMISSION_ACK", "REVIEWER_COMMENTS", "REVISION_CONFIRMATION"],
    ACCEPTED: ["SUBMISSION_ACK", "ACCEPTANCE_LETTER"],
    PAYMENT_REQUESTED: ["SUBMISSION_ACK", "ACCEPTANCE_LETTER", "APC_INVOICE", "PAYMENT_INSTRUCTIONS"],
    PUBLISHED: ["ACCEPTANCE_LETTER"],
  },
  escalationEvidenceKeys: ["hijack.website", "hijack.issn_reuse", "hijack.identity_impersonation", "predatory.indicator"],
  evidenceReviewDeadlineDays: 14,
  reassessmentIntervalDays: 365,
  fastAcceptanceWarnDays: 7,
  headMayOverridePolicyIneligible: true,
};

const docTypeEnum = z.enum(DOC_TYPES as [DocType, ...DocType[]]);

export const policySchema = z.object({
  requireCurrentScopus: z.boolean(),
  discontinuedHandling: z.enum(["INELIGIBLE", "NEEDS_REVIEW"]),
  acceptNationalAccredited: z.boolean(),
  acceptedAccreditationLevels: z.array(z.string().trim().min(1)).max(20),
  requiredQuartiles: z.array(z.enum(["Q1", "Q2", "Q3", "Q4"])),
  quartileMandatory: z.boolean(),
  maxIndexEvidenceAgeDays: z.number().int().min(1).max(3650),
  requiredDocuments: z.object(Object.fromEntries(STAGES.map((s) => [s, z.array(docTypeEnum)])) as Record<Stage, z.ZodArray<typeof docTypeEnum>>),
  escalationEvidenceKeys: z.array(z.string().trim().min(1)).max(50),
  evidenceReviewDeadlineDays: z.number().int().min(1).max(365),
  reassessmentIntervalDays: z.number().int().min(30).max(3650).nullable(),
  fastAcceptanceWarnDays: z.number().int().min(0).max(365),
  headMayOverridePolicyIneligible: z.boolean(),
});

export function parsePolicy(raw: unknown): PolicyConfig {
  return policySchema.parse(raw) as PolicyConfig;
}
