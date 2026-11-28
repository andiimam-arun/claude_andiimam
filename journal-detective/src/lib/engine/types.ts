// Tipe inti mesin keputusan. Modul di folder ini MURNI (tanpa I/O) agar dapat diuji dan diaudit.

export const STAGES = [
  "PRE_SUBMISSION",
  "SUBMITTED",
  "UNDER_REVIEW",
  "REVISION_REQUESTED",
  "REVISED_SUBMITTED",
  "ACCEPTED",
  "PAYMENT_REQUESTED",
  "PUBLISHED",
] as const;
export type Stage = (typeof STAGES)[number];

export type TrafficLight = "GREEN" | "YELLOW" | "RED";
export type EvidenceStatus = "VERIFIED" | "REPORTED_UNVERIFIED" | "NOT_FOUND" | "UNAVAILABLE" | "CONFLICTED";
export type IntegrationState = "LIVE_VERIFIED" | "IMPORTED_DATA" | "MANUAL_EVIDENCE" | "UNAVAILABLE" | "ERROR";
export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EvidenceStrength = "STRONG" | "MODERATE" | "WEAK" | "NONE";
export type ReviewState = "NOT_REQUIRED" | "PENDING" | "CONFIRMED" | "DISMISSED";
export type CheckName = "IDENTITY" | "SCOPUS" | "SCIMAGO" | "PREDATORY" | "HIJACK" | "METADATA" | "NATIONAL";

export type DocType =
  | "SUBMISSION_ACK"
  | "TRACKING_ID"
  | "EDITORIAL_CORRESPONDENCE"
  | "REVIEWER_COMMENTS"
  | "REVISION_CONFIRMATION"
  | "ACCEPTANCE_LETTER"
  | "PORTAL_DETAILS"
  | "APC_INVOICE"
  | "PAYMENT_INSTRUCTIONS"
  | "OTHER";

export const DOC_TYPES: DocType[] = [
  "SUBMISSION_ACK",
  "TRACKING_ID",
  "EDITORIAL_CORRESPONDENCE",
  "REVIEWER_COMMENTS",
  "REVISION_CONFIRMATION",
  "ACCEPTANCE_LETTER",
  "PORTAL_DETAILS",
  "APC_INVOICE",
  "PAYMENT_INSTRUCTIONS",
  "OTHER",
];

/** Satu catatan bukti terstruktur (Bagian 4 spesifikasi). */
export interface EvidenceRecord {
  id?: string;
  check: CheckName;
  /** Kunci semantik, mis. "scopus.coverage", "hijack.website", "beall.match" */
  key: string;
  finding: string;
  status: EvidenceStatus;
  integration: IntegrationState;
  sourceName: string;
  sourceUrl?: string | null;
  sourceRef?: string | null;
  retrievedAt: string; // ISO
  sourceDataDate?: string | null; // ISO atau null bila tidak diketahui
  extracted: string;
  explanation: string;
  severity: Severity;
  /** Kekuatan bukti — dipisahkan dari tingkat keparahan risiko. */
  strength: EvidenceStrength;
  requiresHumanConfirmation: boolean;
  review: ReviewState;
  data: Record<string, any>;
  fingerprint: string;
  origin?: "AUTO" | "MANUAL";
}

export interface JournalIdentityInput {
  title: string;
  altTitles: string[];
  issn?: string | null;
  eissn?: string | null;
  scopusSourceId?: string | null;
  publisher?: string | null;
  country?: string | null;
  officialWebsite?: string | null;
  submittedWebsite?: string | null;
  subjects: string[];
  claimedIndexing: string[]; // mis. ["Scopus","DOAJ","SINTA 2"]
  claimedQuartile?: string | null;
}

export type DocRequirementMap = Record<Stage, DocType[]>;

export interface PolicyConfig {
  /** Apakah indeksasi Scopus aktif wajib untuk kelayakan jurnal. */
  requireCurrentScopus: boolean;
  /** Perlakuan cakupan Scopus yang dihentikan (discontinued) bila Scopus wajib. */
  discontinuedHandling: "INELIGIBLE" | "NEEDS_REVIEW";
  /** Apakah jurnal nasional terakreditasi dapat diterima sebagai alternatif Scopus. */
  acceptNationalAccredited: boolean;
  acceptedAccreditationLevels: string[]; // mis. ["SINTA 1","SINTA 2"]
  /** Kuartil yang diwajibkan (kosong = tidak ada persyaratan). */
  requiredQuartiles: string[];
  quartileMandatory: boolean;
  /** Umur maksimum bukti indeksasi (hari) sebelum dianggap kedaluwarsa. */
  maxIndexEvidenceAgeDays: number;
  requiredDocuments: DocRequirementMap;
  /** Kunci bukti yang bila ditemukan wajib dieskalasi. */
  escalationEvidenceKeys: string[];
  evidenceReviewDeadlineDays: number;
  /** Interval penilaian ulang jurnal yang disetujui (hari); null = tidak berkala. */
  reassessmentIntervalDays: number | null;
  /** Hari minimum yang dianggap "sangat cepat" antara pengiriman dan penerimaan (peringatan kontekstual). */
  fastAcceptanceWarnDays: number;
  /** Apakah Kepala Unit boleh meng-override ketidaklayakan kebijakan (dengan justifikasi). Pemblokiran integritas kritis TIDAK pernah dapat di-override. */
  headMayOverridePolicyIneligible: boolean;
}

export type RedCategory = "CRITICAL_INTEGRITY" | "POLICY_INELIGIBLE";
export type WebsiteStatus = "AUTHENTIC" | "AUTHORIZED_MIGRATION" | "VERIFIED_PLATFORM" | "UNSAFE_CONFIRMED_CLONE" | "SUSPICIOUS" | "UNRESOLVED" | "UNVERIFIED";
export type IndexingStatus =
  | "ACTIVE_VERIFIED"
  | "DISCONTINUED_VERIFIED"
  | "ON_HOLD_VERIFIED"
  | "ACCEPTED_PENDING"
  | "NOT_LISTED_CONCLUSIVE"
  | "NOT_LISTED_INCONCLUSIVE"
  | "OUTDATED_EVIDENCE"
  | "CONFLICTED"
  | "UNVERIFIED";
export type PolicyEligibility = "ELIGIBLE" | "INELIGIBLE" | "UNDETERMINED";
export type PredatoryAssessment = "NOT_ASSESSED" | "NO_CONCERNS_FOUND" | "REVIEW_REQUIRED" | "CONFIRMED_VIOLATION";
export type IdentityStatus = "CORROBORATED" | "UNVERIFIED" | "CONFLICTED";

export interface Reason {
  code: string; // dikunci ke kamus i18n "reason.<code>"
  /** JOURNAL = identitas/indeksasi/kebijakan/predator jurnal; DESTINATION = tujuan (host persis) yang diajukan. */
  scope?: "JOURNAL" | "DESTINATION";
  level: TrafficLight | "INFO";
  params?: Record<string, string | number>;
  evidenceKeys?: string[];
}

export interface JournalDecision {
  /** Status IDENTITAS JURNAL (identitas, indeksasi, kebijakan, predator). TIDAK memuat status tujuan pengiriman. */
  journalStatus: TrafficLight;
  /** Status TUJUAN/situs pengiriman persis yang diajukan; terpisah dari journalStatus. */
  destinationStatus: TrafficLight;
  destinationHost: string | null;
  redCategory: RedCategory | null;
  identityStatus: IdentityStatus;
  websiteStatus: WebsiteStatus;
  indexingStatus: IndexingStatus;
  indexingBasis: IntegrationState | null;
  indexingDataDate: string | null;
  policyEligibility: PolicyEligibility;
  predatoryAssessment: PredatoryAssessment;
  /** True bila identitas jurnal/situs terbukti palsu — klirens diblokir dan TIDAK dapat di-override. */
  identityFraudBlock: boolean;
  needsEscalation: boolean;
  reasons: Reason[];
  nextActions: Array<{ code: string; params?: Record<string, string | number> }>;
}

export type DocVerification = "UNVERIFIED" | "MET" | "UNMET" | "NOT_APPLICABLE";

export interface ChecklistState {
  docType: DocType;
  status: DocVerification;
}

export interface ConsistencyFlagLite {
  code: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH";
  state: "OPEN" | "CONFIRMED" | "DISMISSED";
}

export interface AdministrativeInput {
  stage: Stage;
  checklist: ChecklistState[];
  flags: ConsistencyFlagLite[];
  adminRejected: boolean;
  /** Dokumen yang diwajibkan tetapi belum diunggah/diverifikasi dihitung dari checklist. */
}

export interface AdministrativeDecision {
  status: TrafficLight;
  reasons: Reason[];
  missingDocs: DocType[];
  unverifiedDocs: DocType[];
  unmetDocs: DocType[];
}

export interface FinalDecision {
  status: TrafficLight;
  journalStatus: TrafficLight;
  destinationStatus: TrafficLight;
  administrativeStatus: TrafficLight;
  clearanceBlocked: boolean;
  /** True bila blokir berasal dari identitas palsu (tidak dapat di-override). */
  hardBlock: boolean;
  overridableByHead: boolean;
  reasons: Reason[];
}
