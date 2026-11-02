import { describe, expect, it } from "vitest";
import { decideJournal } from "@/lib/engine/decision";
import { decideAdministrative, decideFinal } from "@/lib/engine/clearance";
import { checkApproval, checkOfficialIssuance } from "@/lib/engine/approval";
import { detectProcessAnomalies } from "@/lib/engine/anomalies";
import { ev, greenSet, identity, NOW, policy } from "./fixtures";
import type { ChecklistState, Stage } from "@/lib/engine/types";

const journal = (evidence = greenSet(), pol = policy(), idn = identity()) => decideJournal({ identity: idn, evidence, policy: pol, now: NOW });
const admin = (stage: Stage, checklist: ChecklistState[] = [], over: any = {}) =>
  decideAdministrative({ stage, checklist, flags: [], adminRejected: false, ...over }, policy());

describe("CASE A — jurnal sah, terindeks aktif, situs otentik", () => {
  it("HIJAU", () => {
    const d = journal();
    expect(d.journalStatus).toBe("GREEN");
    expect(d.websiteStatus).toBe("AUTHENTIC");
    expect(d.indexingStatus).toBe("ACTIVE_VERIFIED");
    expect(d.indexingBasis).toBe("IMPORTED_DATA"); // tidak pernah diklaim sebagai verifikasi langsung
    expect(d.redCategory).toBeNull();
  });
  it("bukti indeksasi kedaluwarsa → KUNING (bukan HIJAU)", () => {
    const d = journal([ev.identityOk(), ev.scopus("ACTIVE", { sourceDataDate: "2024-01-01T00:00:00Z" }), ev.siteMatches()]);
    expect(d.indexingStatus).toBe("OUTDATED_EVIDENCE");
    expect(d.journalStatus).toBe("YELLOW");
  });
  it("tanpa bukti identitas/situs tidak pernah HIJAU", () => {
    expect(journal([ev.scopus("ACTIVE")]).journalStatus).toBe("YELLOW");
  });
});

describe("CASE B — jurnal HIJAU, surat penerimaan belum terverifikasi → permohonan KUNING", () => {
  it("dimensi terpisah", () => {
    const j = journal();
    const a = admin("PAYMENT_REQUESTED", [
      { docType: "SUBMISSION_ACK", status: "MET" },
      { docType: "ACCEPTANCE_LETTER", status: "UNVERIFIED" },
      { docType: "APC_INVOICE", status: "MET" },
      { docType: "PAYMENT_INSTRUCTIONS", status: "MET" },
    ]);
    const f = decideFinal(j, a, policy());
    expect(j.journalStatus).toBe("GREEN");
    expect(a.status).toBe("YELLOW");
    expect(a.unverifiedDocs).toEqual(["ACCEPTANCE_LETTER"]);
    expect(f.status).toBe("YELLOW");
    expect(f.clearanceBlocked).toBe(false);
  });
});

describe("CASE C — situs klon terkonfirmasi", () => {
  it("situs MERAH & klirens diblokir; identitas asli tetap dicatat", () => {
    const j = journal([ev.identityOk(), ev.scopus("ACTIVE"), ev.siteClone()], policy(), identity({ submittedWebsite: "https://jurnal-fiktif-online.example" }));
    expect(j.websiteStatus).toBe("UNSAFE_CONFIRMED_CLONE");
    expect(j.journalStatus).toBe("RED");
    expect(j.redCategory).toBe("CRITICAL_INTEGRITY");
    expect(j.identityFraudBlock).toBe(true);
    expect(j.identityStatus).toBe("CORROBORATED");
    expect(j.predatoryAssessment).not.toBe("CONFIRMED_VIOLATION"); // klon ≠ jurnal predator
    const f = decideFinal(j, admin("PRE_SUBMISSION"), policy());
    expect(f.status).toBe("RED");
    expect(f.clearanceBlocked).toBe(true);
    expect(f.hardBlock).toBe(true);
    expect(f.overridableByHead).toBe(false);
  });
  it("kecurigaan klon (belum dikonfirmasi) → KUNING; bukan RED otomatis", () => {
    const sus = { ...ev.siteClone(), status: "REPORTED_UNVERIFIED" as const, requiresHumanConfirmation: true, review: "PENDING" as const, data: { relation: "LOOKALIKE", submittedDomain: "jurnal-fiktif-online.example", officialDomains: ["jurnal-fiktif.example"] } };
    const j = journal([ev.identityOk(), ev.scopus("ACTIVE"), sus]);
    expect(j.websiteStatus).toBe("SUSPICIOUS");
    expect(j.journalStatus).toBe("YELLOW");
    expect(j.identityFraudBlock).toBe(false);
  });
  it("peninjau mengonfirmasi kecurigaan → klon terkonfirmasi", () => {
    const sus = { ...ev.siteClone(), status: "REPORTED_UNVERIFIED" as const, requiresHumanConfirmation: true, review: "CONFIRMED" as const, data: { relation: "LOOKALIKE", submittedDomain: "x.example", officialDomains: ["jurnal-fiktif.example"] } };
    expect(journal([ev.identityOk(), ev.scopus("ACTIVE"), sus]).journalStatus).toBe("RED");
  });
  it("kecurigaan ditolak peninjau tidak membuat HIJAU tanpa bukti kecocokan", () => {
    const sus = { ...ev.siteClone(), status: "REPORTED_UNVERIFIED" as const, requiresHumanConfirmation: true, review: "DISMISSED" as const, data: { relation: "LOOKALIKE" } };
    expect(journal([ev.identityOk(), ev.scopus("ACTIVE"), sus]).journalStatus).toBe("YELLOW");
  });
});

describe("CASE D — Scopus dihentikan, kebijakan mewajibkan indeksasi aktif", () => {
  it("MERAH karena kebijakan, TANPA label predator", () => {
    const j = journal([ev.identityOk(), ev.scopus("DISCONTINUED"), ev.siteMatches()]);
    expect(j.journalStatus).toBe("RED");
    expect(j.redCategory).toBe("POLICY_INELIGIBLE");
    expect(j.policyEligibility).toBe("INELIGIBLE");
    expect(j.predatoryAssessment).not.toBe("CONFIRMED_VIOLATION");
    expect(j.identityFraudBlock).toBe(false);
    expect(j.reasons.some((r) => r.code === "not_predatory_note")).toBe(true);
    const f = decideFinal(j, admin("PRE_SUBMISSION"), policy());
    expect(f.overridableByHead).toBe(true); // keputusan kebijakan, bukan pemalsuan
  });
  it("kebijakan tidak mewajibkan Scopus → tidak RED", () => {
    const j = journal([ev.identityOk(), ev.scopus("DISCONTINUED"), ev.siteMatches()], policy({ requireCurrentScopus: false }), identity({ claimedIndexing: [] }));
    expect(j.journalStatus).toBe("GREEN");
  });
  it("penanganan NEEDS_REVIEW → KUNING", () => {
    expect(journal([ev.identityOk(), ev.scopus("DISCONTINUED"), ev.siteMatches()], policy({ discontinuedHandling: "NEEDS_REVIEW" })).journalStatus).toBe("YELLOW");
  });
  it("akreditasi nasional yang diterima kebijakan memenuhi syarat", () => {
    const nat = { ...ev.identityOk(), check: "NATIONAL" as const, key: "national.accreditation", data: { accredited: true, level: "SINTA 2" } };
    const j = journal([ev.identityOk(), ev.scopus("DISCONTINUED"), ev.siteMatches(), nat], policy({ acceptNationalAccredited: true }), identity({ claimedIndexing: [] }));
    expect(j.journalStatus).toBe("GREEN");
  });
});

describe("CASE E — Beall historis tanpa pelanggaran terkorroborasi", () => {
  it("bendera investigasi, bukan RED otomatis", () => {
    const j = journal([...greenSet(), ev.beall("PENDING")]);
    expect(j.journalStatus).toBe("YELLOW");
    expect(j.predatoryAssessment).toBe("REVIEW_REQUIRED");
    expect(j.reasons.some((r) => r.code === "beall_not_automatic")).toBe(true);
    expect(j.nextActions.some((a) => a.code === "review_beall_match")).toBe(true);
  });
  it("setelah ditinjau dan ditolak, dapat HIJAU", () => {
    expect(journal([...greenSet(), ev.beall("DISMISSED")]).journalStatus).toBe("GREEN");
  });
  it("dikonfirmasi peninjau tetap tidak otomatis RED", () => {
    expect(journal([...greenSet(), ev.beall("CONFIRMED")]).journalStatus).toBe("YELLOW");
  });
  it("hanya pelanggaran kritis terverifikasi yang membuat RED", () => {
    const j = journal([...greenSet(), ev.indicator("CRITICAL")]);
    expect(j.journalStatus).toBe("RED");
    expect(j.predatoryAssessment).toBe("CONFIRMED_VIOLATION");
  });
  it("indikator ringan tidak mengubah status", () => {
    expect(journal([...greenSet(), ev.indicator("LOW")]).journalStatus).toBe("GREEN");
  });
});

describe("CASE F — data Scopus tidak tersedia", () => {
  it("indeksasi UNVERIFIED, tidak ada HIJAU palsu", () => {
    const j = journal([ev.identityOk(), ev.scopusUnavailable(), ev.siteMatches()]);
    expect(j.indexingStatus).toBe("UNVERIFIED");
    expect(j.journalStatus).toBe("YELLOW");
    expect(j.policyEligibility).toBe("UNDETERMINED");
    expect(j.indexingBasis).toBeNull();
  });
  it("tanpa catatan Scopus sama sekali pun UNVERIFIED", () => {
    expect(journal([ev.identityOk(), ev.siteMatches()]).indexingStatus).toBe("UNVERIFIED");
  });
  it("'tidak ditemukan' pada impor historis bukan bukti negatif", () => {
    const j = journal([ev.identityOk(), ev.scopusNotFound("IMPORTED_DATA", false), ev.siteMatches()]);
    expect(j.indexingStatus).toBe("NOT_LISTED_INCONCLUSIVE");
    expect(j.journalStatus).toBe("YELLOW");
  });
  it("tidak ditemukan secara konklusif + klaim Scopus = klaim palsu (RED integritas)", () => {
    const j = journal([ev.identityOk(), ev.scopusNotFound("LIVE_VERIFIED", true), ev.siteMatches()]);
    expect(j.journalStatus).toBe("RED");
    expect(j.redCategory).toBe("CRITICAL_INTEGRITY");
  });
  it("tidak ditemukan konklusif TANPA klaim Scopus = tidak layak kebijakan, bukan predator", () => {
    const j = journal([ev.identityOk(), ev.scopusNotFound("MANUAL_EVIDENCE", true), ev.siteMatches()], policy(), identity({ claimedIndexing: [] }));
    expect(j.journalStatus).toBe("RED");
    expect(j.redCategory).toBe("POLICY_INELIGIBLE");
    expect(j.predatoryAssessment).not.toBe("CONFIRMED_VIOLATION");
  });
  it("konflik antar sumber → KUNING", () => {
    const j = journal([ev.identityOk(), ev.scopus("ACTIVE"), ev.scopus("DISCONTINUED", { integration: "MANUAL_EVIDENCE" }), ev.siteMatches()]);
    expect(j.indexingStatus).toBe("CONFLICTED");
    expect(j.journalStatus).toBe("YELLOW");
  });
  it("bukti langsung (live) mengalahkan impor", () => {
    const j = journal([ev.identityOk(), ev.scopus("DISCONTINUED"), ev.scopus("ACTIVE", { integration: "LIVE_VERIFIED", sourceDataDate: "2026-10-30T00:00:00Z" }), ev.siteMatches()]);
    expect(j.indexingStatus).toBe("ACTIVE_VERIFIED");
    expect(j.indexingBasis).toBe("LIVE_VERIFIED");
  });
});

describe("CASE G — diterima tanpa putaran revisi", () => {
  it("tidak ditolak hanya karena tidak ada revisi", () => {
    const flags = detectProcessAnomalies(
      [{ type: "SUBMITTED", occurredAt: new Date("2026-08-01") }, { type: "UNDER_REVIEW", occurredAt: new Date("2026-08-05") }, { type: "ACCEPTED", occurredAt: new Date("2026-09-20") }],
      7, NOW,
    );
    expect(flags).toEqual([]);
    const a = admin("ACCEPTED", [{ docType: "SUBMISSION_ACK", status: "MET" }, { docType: "ACCEPTANCE_LETTER", status: "MET" }]);
    expect(a.status).toBe("GREEN");
    expect(decideFinal(journal(), a, policy()).status).toBe("GREEN");
  });
  it("penerimaan sangat cepat = peringatan kontekstual LOW saja", () => {
    const flags = detectProcessAnomalies([{ type: "SUBMITTED", occurredAt: new Date("2026-09-01") }, { type: "ACCEPTED", occurredAt: new Date("2026-09-03") }], 7, NOW);
    expect(flags.map((f) => f.code)).toEqual(["fast_acceptance"]);
    expect(flags[0].severity).toBe("LOW");
    const a = admin("ACCEPTED", [{ docType: "SUBMISSION_ACK", status: "MET" }, { docType: "ACCEPTANCE_LETTER", status: "MET" }], { flags: [{ code: "fast_acceptance", severity: "LOW", state: "OPEN" }] });
    expect(a.status).toBe("YELLOW"); // perlu dibaca peninjau, bukan RED
  });
  it("urutan tidak logis ditandai", () => {
    const flags = detectProcessAnomalies([{ type: "ACCEPTED", occurredAt: new Date("2026-05-01") }, { type: "SUBMITTED", occurredAt: new Date("2026-06-01") }], 7, NOW);
    expect(flags.some((f) => f.code === "event_order")).toBe(true);
  });
  it("praSubmisi tidak menuntut bukti peristiwa yang belum terjadi", () => {
    const a = admin("PRE_SUBMISSION");
    expect(a.status).toBe("GREEN");
    expect(a.missingDocs).toEqual([]);
  });
});

describe("CASE H — surat penerimaan valid untuk situs klon", () => {
  it("identitas jurnal mengalahkan bukti penerimaan; klirens diblokir", () => {
    const j = journal([ev.identityOk(), ev.scopus("ACTIVE"), ev.siteClone()]);
    const a = admin("ACCEPTED", [{ docType: "SUBMISSION_ACK", status: "MET" }, { docType: "ACCEPTANCE_LETTER", status: "MET" }]);
    expect(a.status).toBe("GREEN");
    const f = decideFinal(j, a, policy());
    expect(f.status).toBe("RED");
    expect(f.clearanceBlocked).toBe(true);
    expect(f.hardBlock).toBe(true);
    expect(f.administrativeStatus).toBe("GREEN"); // dimensi tetap dilaporkan terpisah
    expect(f.journalStatus).toBe("RED");
    expect(checkApproval({ role: "HEAD", state: "IN_REVIEW", final: f, justification: "x".repeat(50) })).toMatchObject({ ok: false, error: "IDENTITY_FRAUD_BLOCK" });
  });
  it("RED administratif tidak berarti jurnal palsu", () => {
    const a = admin("ACCEPTED", [], { adminRejected: true });
    const f = decideFinal(journal(), a, policy());
    expect(a.status).toBe("RED");
    expect(f.status).toBe("RED");
    expect(f.journalStatus).toBe("GREEN");
  });
});

describe("CASE I — penerbitan surat resmi tanpa persetujuan berwenang", () => {
  const green = decideFinal(journal(), admin("PRE_SUBMISSION"), policy());
  it("administrator tidak dapat menerbitkan (hanya draf)", () => {
    expect(checkOfficialIssuance({ role: "ADMIN", state: "APPROVED", final: green, officialNumber: "001/UN/2026" })).toEqual({ ok: false, error: "ROLE_NOT_ALLOWED" });
  });
  it("Kepala Unit tidak dapat menerbitkan sebelum APPROVED", () => {
    expect(checkOfficialIssuance({ role: "HEAD", state: "RECOMMENDED", final: green, officialNumber: "001" })).toEqual({ ok: false, error: "NOT_APPROVED" });
  });
  it("nomor surat resmi tidak pernah dikarang sistem", () => {
    expect(checkOfficialIssuance({ role: "HEAD", state: "APPROVED", final: green, officialNumber: "  " })).toEqual({ ok: false, error: "NUMBER_REQUIRED" });
  });
  it("Kepala Unit setelah persetujuan + nomor → boleh", () => {
    expect(checkOfficialIssuance({ role: "HEAD", state: "APPROVED", final: green, officialNumber: "001/UN/2026" }).ok).toBe(true);
  });
  it("hanya HEAD yang dapat menyetujui", () => {
    for (const role of ["STUDENT", "REVIEWER", "ADMIN"] as const) {
      expect(checkApproval({ role, state: "IN_REVIEW", final: green }).error).toBe("ROLE_NOT_ALLOWED");
    }
    expect(checkApproval({ role: "HEAD", state: "IN_REVIEW", final: green }).ok).toBe(true);
  });
  it("persetujuan non-HIJAU membutuhkan justifikasi tertulis", () => {
    const y = decideFinal(journal([ev.identityOk(), ev.siteMatches()]), admin("PRE_SUBMISSION"), policy());
    expect(checkApproval({ role: "HEAD", state: "IN_REVIEW", final: y }).error).toBe("OVERRIDE_JUSTIFICATION_REQUIRED");
    expect(checkApproval({ role: "HEAD", state: "IN_REVIEW", final: y, justification: "Bukti tambahan diterima melalui surel resmi penerbit." })).toMatchObject({ ok: true, isOverride: true });
  });
  it("RED kebijakan dapat di-override hanya bila kebijakan mengizinkan", () => {
    const j = journal([ev.identityOk(), ev.scopus("DISCONTINUED"), ev.siteMatches()]);
    const f1 = decideFinal(j, admin("PRE_SUBMISSION"), policy({ headMayOverridePolicyIneligible: true }));
    const f2 = decideFinal(j, admin("PRE_SUBMISSION"), policy({ headMayOverridePolicyIneligible: false }));
    const just = "Pengecualian terdokumentasi sesuai keputusan rapat unit.";
    expect(checkApproval({ role: "HEAD", state: "IN_REVIEW", final: f1, justification: just }).ok).toBe(true);
    expect(checkApproval({ role: "HEAD", state: "IN_REVIEW", final: f2, justification: just }).error).toBe("BLOCKED_NOT_OVERRIDABLE");
  });
});
