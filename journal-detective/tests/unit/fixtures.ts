import { makeEvidence } from "@/lib/engine/evidence";
import { DEMO_POLICY } from "@/lib/engine/policy";
import type { EvidenceRecord, JournalIdentityInput, PolicyConfig } from "@/lib/engine/types";

export const NOW = new Date("2026-11-02T00:00:00Z");
export const policy = (over: Partial<PolicyConfig> = {}): PolicyConfig => ({ ...DEMO_POLICY, ...over });

export const identity = (over: Partial<JournalIdentityInput> = {}): JournalIdentityInput => ({
  title: "Jurnal Fiktif Nusantara",
  altTitles: [],
  issn: "0000-0019",
  eissn: null,
  publisher: "Penerbit Fiktif",
  subjects: [],
  claimedIndexing: ["Scopus"],
  submittedWebsite: "https://jurnal-fiktif.example",
  ...over,
});

const base = { retrievedAt: NOW.toISOString(), sourceName: "Uji" } as const;

export const ev = {
  identityOk: (): EvidenceRecord => makeEvidence({ ...base, check: "IDENTITY", key: "identity.corroboration", finding: "Identitas terkorroborasi", status: "VERIFIED", integration: "IMPORTED_DATA" }),
  scopus: (coverage: "ACTIVE" | "DISCONTINUED" | "ON_HOLD", over: Partial<Parameters<typeof makeEvidence>[0]> = {}): EvidenceRecord =>
    makeEvidence({ ...base, check: "SCOPUS", key: "scopus.coverage", finding: `Scopus ${coverage}`, status: "VERIFIED", integration: "IMPORTED_DATA", sourceDataDate: "2026-09-01T00:00:00Z", data: { coverage, coverageTo: coverage === "DISCONTINUED" ? "2022" : undefined }, ...over }),
  scopusNotFound: (integration: "IMPORTED_DATA" | "LIVE_VERIFIED" | "MANUAL_EVIDENCE", conclusive: boolean): EvidenceRecord =>
    makeEvidence({ ...base, check: "SCOPUS", key: "scopus.coverage", finding: "Tidak ditemukan", status: "NOT_FOUND", integration, data: { conclusive } }),
  scopusUnavailable: (): EvidenceRecord => makeEvidence({ ...base, check: "SCOPUS", key: "scopus.coverage", finding: "Tidak ada data", status: "UNAVAILABLE", integration: "UNAVAILABLE" }),
  siteMatches: (): EvidenceRecord => makeEvidence({ ...base, check: "HIJACK", key: "hijack.website", finding: "Cocok", status: "VERIFIED", integration: "IMPORTED_DATA", data: { relation: "MATCHES_OFFICIAL", submittedDomain: "jurnal-fiktif.example", officialDomains: ["jurnal-fiktif.example"] } }),
  siteClone: (): EvidenceRecord => makeEvidence({ ...base, check: "HIJACK", key: "hijack.website", finding: "Klon terkonfirmasi", status: "VERIFIED", integration: "MANUAL_EVIDENCE", severity: "CRITICAL", data: { relation: "CONFIRMED_CLONE", submittedDomain: "jurnal-fiktif-online.example", officialDomains: ["jurnal-fiktif.example"] } }),
  beall: (review: "PENDING" | "DISMISSED" | "CONFIRMED" = "PENDING"): EvidenceRecord =>
    makeEvidence({ ...base, check: "PREDATORY", key: "beall.match", finding: "Cocok daftar historis", status: "REPORTED_UNVERIFIED", integration: "IMPORTED_DATA", severity: "MEDIUM", requiresHumanConfirmation: true, review, sourceDataDate: "2016-01-01T00:00:00Z", data: { year: 2016 } }),
  indicator: (severity: "CRITICAL" | "HIGH" | "LOW"): EvidenceRecord =>
    makeEvidence({ ...base, check: "PREDATORY", key: "predatory.indicator", finding: "Indikator", status: "VERIFIED", integration: "MANUAL_EVIDENCE", severity, data: { indicator: "fake_editorial_board" } }),
  sjr: (quartile: string): EvidenceRecord => makeEvidence({ ...base, check: "SCIMAGO", key: "scimago.entry", finding: `SJR ${quartile}`, status: "VERIFIED", integration: "MANUAL_EVIDENCE", data: { found: true, quartile, year: 2025 } }),
};

export const greenSet = (): EvidenceRecord[] => [ev.identityOk(), ev.scopus("ACTIVE"), ev.siteMatches()];
