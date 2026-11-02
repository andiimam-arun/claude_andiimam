import type {
  EvidenceRecord, IdentityStatus, IndexingStatus, IntegrationState, JournalDecision, JournalIdentityInput,
  PolicyConfig, PolicyEligibility, PredatoryAssessment, Reason, RedCategory, WebsiteStatus,
} from "./types";
import { daysBetween } from "./util";

/**
 * MESIN KEPUTUSAN JURNAL (aturan transparan, tanpa AI, tanpa skor numerik).
 * Prinsip: data hilang ≠ bukti negatif; tidak ada status HIJAU tanpa bukti; identitas palsu terkonfirmasi tidak dapat di-override.
 * Dokumentasi lengkap: docs/ASSESSMENT_POLICY.md
 */

const LIVE_OR_MANUAL: IntegrationState[] = ["LIVE_VERIFIED", "MANUAL_EVIDENCE"];


const flagged = (e: EvidenceRecord) => e.requiresHumanConfirmation && e.review !== "DISMISSED";
const pending = (e: EvidenceRecord) => e.requiresHumanConfirmation && e.review === "PENDING";
const confirmed = (e: EvidenceRecord) => e.review === "CONFIRMED";

function dataDate(e: EvidenceRecord): Date {
  return new Date(e.sourceDataDate ?? e.retrievedAt);
}

export interface DecideJournalInput {
  identity: JournalIdentityInput;
  evidence: EvidenceRecord[];
  policy: PolicyConfig;
  now?: Date;
}

export function decideJournal({ identity, evidence, policy, now = new Date() }: DecideJournalInput): JournalDecision {
  const reasons: Reason[] = [];
  const actions: JournalDecision["nextActions"] = [];
  const addAction = (code: string, params?: Record<string, string | number>) => {
    if (!actions.some((a) => a.code === code)) actions.push({ code, params });
  };
  const yellow = (code: string, params?: Record<string, string | number>, evidenceKeys?: string[]) =>
    reasons.push({ code, level: "YELLOW", params, evidenceKeys });
  const green = (code: string, params?: Record<string, string | number>, evidenceKeys?: string[]) =>
    reasons.push({ code, level: "GREEN", params, evidenceKeys });
  const info = (code: string, params?: Record<string, string | number>, evidenceKeys?: string[]) =>
    reasons.push({ code, level: "INFO", params, evidenceKeys });
  const red = (code: string, params?: Record<string, string | number>, evidenceKeys?: string[]) =>
    reasons.push({ code, level: "RED", params, evidenceKeys });

  const claimed = identity.claimedIndexing.map((c) => c.toLowerCase());
  const claimsScopus = claimed.some((c) => c.includes("scopus"));
  const claimsDoaj = claimed.some((c) => c.includes("doaj"));
  const claimsNational = claimed.some((c) => c.includes("sinta") || c.includes("akredit") || c.includes("accredit"));

  // ---------- 1. Identitas ----------
  const identityConflicts = evidence.filter((e) => e.key.startsWith("identity.") && e.key !== "identity.corroboration" && e.key !== "identity.official_domain" && (e.status === "CONFLICTED" || e.requiresHumanConfirmation) && e.review !== "DISMISSED");
  const corroboration = evidence.filter((e) => e.key === "identity.corroboration" && e.status === "VERIFIED");
  let identityStatus: IdentityStatus = "UNVERIFIED";
  if (identityConflicts.length) identityStatus = "CONFLICTED";
  else if (corroboration.length) identityStatus = "CORROBORATED";

  // ---------- 2. Situs yang diajukan ----------
  const hj = evidence.filter((e) => e.key === "hijack.website");
  let websiteStatus: WebsiteStatus = "UNVERIFIED";
  const confirmedClone = hj.find(
    (e) => (e.data.relation === "CONFIRMED_CLONE" && e.status === "VERIFIED" && e.review !== "DISMISSED") ||
      (["REPORTED_CLONE", "LOOKALIKE", "DIFFERENT_DOMAIN"].includes(e.data.relation) && confirmed(e)),
  );
  const matches = hj.find((e) => e.data.relation === "MATCHES_OFFICIAL" && e.status === "VERIFIED");
  const migration = hj.find((e) => e.data.relation === "AUTHORIZED_MIGRATION" && e.status === "VERIFIED" && e.review !== "DISMISSED");
  const suspicious = hj.find((e) => ["REPORTED_CLONE", "LOOKALIKE", "DIFFERENT_DOMAIN"].includes(e.data.relation) && pending(e));
  if (confirmedClone) websiteStatus = "UNSAFE_CONFIRMED_CLONE";
  else if (suspicious) websiteStatus = "SUSPICIOUS";
  else if (migration) websiteStatus = "AUTHORIZED_MIGRATION";
  else if (matches) websiteStatus = "AUTHENTIC";

  // Peringatan peniruan lain (situs lain yang memakai ISSN yang sama, dsb.)
  const otherHijack = evidence.filter((e) => e.key.startsWith("hijack.") && e.key !== "hijack.website" && flagged(e));
  const impersonation = evidence.find((e) => e.key === "hijack.identity_impersonation" && e.status === "VERIFIED" && e.review !== "DISMISSED");

  // ---------- 3. Indeksasi Scopus ----------
  const scopusAll = evidence.filter((e) => e.key === "scopus.coverage");
  const live = scopusAll.filter((e) => e.integration === "LIVE_VERIFIED" && e.status === "VERIFIED");
  const verifiedCov = (live.length ? live : scopusAll.filter((e) => e.status === "VERIFIED")).filter((e) => ["ACTIVE", "DISCONTINUED", "ON_HOLD"].includes(e.data.coverage));
  const covSet = new Set(verifiedCov.map((e) => e.data.coverage as string));
  const conflicted = scopusAll.some((e) => e.status === "CONFLICTED") || covSet.size > 1;
  let indexingStatus: IndexingStatus = "UNVERIFIED";
  let indexingBasis: IntegrationState | null = null;
  let indexingDataDate: string | null = null;
  let indexingEvidence: EvidenceRecord | undefined;

  if (conflicted) {
    indexingStatus = "CONFLICTED";
    indexingEvidence = verifiedCov[0] ?? scopusAll[0];
  } else if (verifiedCov.length) {
    indexingEvidence = [...verifiedCov].sort((a, b) => dataDate(b).getTime() - dataDate(a).getTime())[0];
    const cov = indexingEvidence.data.coverage as string;
    indexingBasis = indexingEvidence.integration;
    indexingDataDate = indexingEvidence.sourceDataDate ?? indexingEvidence.retrievedAt;
    const ageDays = daysBetween(dataDate(indexingEvidence), now);
    if (cov === "ACTIVE") {
      indexingStatus = ageDays > policy.maxIndexEvidenceAgeDays ? "OUTDATED_EVIDENCE" : "ACTIVE_VERIFIED";
    } else if (cov === "DISCONTINUED") indexingStatus = "DISCONTINUED_VERIFIED";
    else indexingStatus = "ON_HOLD_VERIFIED";
  } else {
    const nf = scopusAll.find((e) => e.status === "NOT_FOUND");
    if (nf) {
      indexingEvidence = nf;
      indexingBasis = nf.integration;
      indexingDataDate = nf.sourceDataDate ?? nf.retrievedAt;
      indexingStatus = LIVE_OR_MANUAL.includes(nf.integration) && nf.data.conclusive === true ? "NOT_LISTED_CONCLUSIVE" : "NOT_LISTED_INCONCLUSIVE";
    }
  }

  // ---------- 4. Akreditasi nasional (bukti manual) & SCImago ----------
  const national = evidence.find((e) => e.key === "national.accreditation" && e.status === "VERIFIED" && e.data.accredited === true);
  const nationalOk = !!national && policy.acceptNationalAccredited &&
    policy.acceptedAccreditationLevels.map((l) => l.toLowerCase()).includes(String(national.data.level ?? "").toLowerCase());
  const sci = evidence.find((e) => e.key === "scimago.entry" && e.status === "VERIFIED" && e.data.found === true);

  // ---------- 5. Prediktor penerbitan predator ----------
  const beall = evidence.filter((e) => e.key === "beall.match");
  const indicators = evidence.filter((e) => e.key === "predatory.indicator" && e.status === "VERIFIED" && e.review !== "DISMISSED");
  const criticalIndicator = indicators.find((e) => e.severity === "CRITICAL");
  const seriousIndicators = indicators.filter((e) => e.severity === "HIGH" || e.severity === "MEDIUM");
  const predatoryChecked = evidence.some((e) => e.check === "PREDATORY" && e.status !== "UNAVAILABLE");

  // ---------- Evaluasi ----------
  let redCategory: RedCategory | null = null;
  let identityFraudBlock = false;

  // RED integritas kritis
  if (confirmedClone) {
    redCategory = "CRITICAL_INTEGRITY";
    identityFraudBlock = true;
    red("website_confirmed_clone", { domain: String(confirmedClone.data.submittedDomain ?? "") }, ["hijack.website"]);
    if (identityStatus === "CORROBORATED" || (confirmedClone.data.officialDomains ?? []).length) {
      info("identity_authentic_site_clone", { officials: (confirmedClone.data.officialDomains ?? []).join(", ") });
      addAction("use_official_site", { officials: (confirmedClone.data.officialDomains ?? []).join(", ") });
    }
    addAction("warn_student_clone");
  }
  if (impersonation) {
    redCategory = "CRITICAL_INTEGRITY";
    identityFraudBlock = true;
    red("identity_impersonation_confirmed", {}, ["hijack.identity_impersonation"]);
  }
  if (claimsScopus && indexingStatus === "NOT_LISTED_CONCLUSIVE") {
    redCategory = "CRITICAL_INTEGRITY";
    red("scopus_claim_false", {}, ["scopus.coverage"]);
  }
  if (criticalIndicator) {
    redCategory = "CRITICAL_INTEGRITY";
    red("critical_violation_confirmed", { indicator: String(criticalIndicator.data.indicator ?? criticalIndicator.finding) }, ["predatory.indicator"]);
  }

  // Kelayakan kebijakan
  let eligibility = "ELIGIBLE" as PolicyEligibility;
  const mark = (e: PolicyEligibility) => {
    if (e === "INELIGIBLE") eligibility = "INELIGIBLE";
    else if (e === "UNDETERMINED" && eligibility !== "INELIGIBLE") eligibility = "UNDETERMINED";
  };

  if (policy.requireCurrentScopus) {
    if (indexingStatus === "ACTIVE_VERIFIED") {
      green("scopus_active_verified", { basis: indexingBasis ?? "", date: (indexingDataDate ?? "").slice(0, 10) }, ["scopus.coverage"]);
    } else if (nationalOk) {
      green("national_accreditation_accepted", { level: String(national!.data.level) }, ["national.accreditation"]);
    } else if (indexingStatus === "DISCONTINUED_VERIFIED") {
      if (policy.discontinuedHandling === "INELIGIBLE") {
        mark("INELIGIBLE");
        red("policy_scopus_discontinued", { to: String(indexingEvidence?.data.coverageTo ?? "?") }, ["scopus.coverage"]);
        info("not_predatory_note");
      } else {
        mark("UNDETERMINED");
        yellow("scopus_discontinued_needs_review", { to: String(indexingEvidence?.data.coverageTo ?? "?") }, ["scopus.coverage"]);
      }
      addAction("review_policy_ineligible");
    } else if (indexingStatus === "NOT_LISTED_CONCLUSIVE") {
      mark("INELIGIBLE");
      red("policy_scopus_not_listed", {}, ["scopus.coverage"]);
      info("not_predatory_note");
    } else if (indexingStatus === "ON_HOLD_VERIFIED") {
      mark("UNDETERMINED");
      yellow("scopus_on_hold", {}, ["scopus.coverage"]);
      addAction("verify_scopus_current");
    } else if (indexingStatus === "OUTDATED_EVIDENCE") {
      mark("UNDETERMINED");
      yellow("scopus_evidence_outdated", { date: (indexingDataDate ?? "").slice(0, 10), max: policy.maxIndexEvidenceAgeDays }, ["scopus.coverage"]);
      addAction("refresh_scopus_evidence");
    } else if (indexingStatus === "CONFLICTED") {
      mark("UNDETERMINED");
      yellow("scopus_conflicting", {}, ["scopus.coverage"]);
      addAction("resolve_scopus_conflict");
    } else if (indexingStatus === "NOT_LISTED_INCONCLUSIVE") {
      mark("UNDETERMINED");
      yellow("scopus_not_in_import", { date: (indexingDataDate ?? "").slice(0, 10) }, ["scopus.coverage"]);
      addAction("verify_scopus_manually");
    } else {
      mark("UNDETERMINED");
      yellow("scopus_unverified", {}, ["scopus.coverage"]);
      addAction("import_scopus_or_manual");
    }
  } else {
    // Kebijakan tidak mewajibkan Scopus: status tetap dilaporkan sebagai informasi, bukan syarat.
    if (indexingStatus === "ACTIVE_VERIFIED") green("scopus_active_verified", { basis: indexingBasis ?? "", date: (indexingDataDate ?? "").slice(0, 10) }, ["scopus.coverage"]);
    else info("scopus_not_required", { status: indexingStatus });
  }

  // Kuartil
  if (policy.requiredQuartiles.length) {
    const q = sci ? String(sci.data.quartile ?? "") : "";
    if (sci && q) {
      if (policy.requiredQuartiles.includes(q)) green("quartile_ok", { q, year: String(sci.data.year ?? "?") }, ["scimago.entry"]);
      else if (policy.quartileMandatory) {
        mark("INELIGIBLE");
        red("policy_quartile_not_met", { q, year: String(sci.data.year ?? "?"), req: policy.requiredQuartiles.join("/") }, ["scimago.entry"]);
      } else yellow("quartile_not_met_optional", { q, req: policy.requiredQuartiles.join("/") }, ["scimago.entry"]);
    } else {
      if (policy.quartileMandatory) mark("UNDETERMINED");
      yellow("quartile_unverified", { req: policy.requiredQuartiles.join("/") }, ["scimago.entry"]);
      addAction("add_scimago_evidence");
    }
  }

  // Perbandingan klaim vs bukti
  if (claimsScopus && indexingStatus === "DISCONTINUED_VERIFIED") info("scopus_claim_outdated");
  if (claimsScopus && !policy.requireCurrentScopus && indexingStatus !== "ACTIVE_VERIFIED" && indexingStatus !== "NOT_LISTED_CONCLUSIVE") {
    yellow("claim_scopus_unverified");
    addAction("verify_scopus_manually");
  }
  if (claimsDoaj) {
    const d = evidence.find((e) => e.key === "metadata.doaj" && e.status === "VERIFIED");
    const dn = evidence.find((e) => e.key === "metadata.doaj" && e.status === "NOT_FOUND" && e.integration === "LIVE_VERIFIED");
    if (d) green("doaj_claim_verified", {}, ["metadata.doaj"]);
    else if (dn) yellow("doaj_claim_contradicted", {}, ["metadata.doaj"]);
    else yellow("doaj_claim_unverified", {}, ["metadata.doaj"]);
  }
  if (claimsNational && !nationalOk && !national) {
    yellow("national_claim_unverified");
    addAction("add_national_evidence");
  }
  if (identity.claimedQuartile && sci && sci.data.quartile && identity.claimedQuartile.toUpperCase() !== String(sci.data.quartile).toUpperCase()) {
    yellow("quartile_claim_mismatch", { claimed: identity.claimedQuartile, found: String(sci.data.quartile), year: String(sci.data.year ?? "?") }, ["scimago.entry"]);
  }
  if (sci && (indexingStatus === "DISCONTINUED_VERIFIED" || indexingStatus === "NOT_LISTED_CONCLUSIVE")) {
    info("scimago_scopus_discrepancy", { year: String(sci.data.year ?? "?") }, ["scimago.entry", "scopus.coverage"]);
  } else if (sci && indexingStatus === "UNVERIFIED") {
    info("scimago_supplementary_only", { year: String(sci.data.year ?? "?") }, ["scimago.entry"]);
  }

  // Identitas
  if (identityStatus === "CORROBORATED") green("identity_corroborated", {}, ["identity.corroboration"]);
  else if (identityStatus === "CONFLICTED") {
    yellow("identity_conflicted", { n: identityConflicts.length }, identityConflicts.map((e) => e.key));
    addAction("resolve_identity_conflict");
  } else {
    yellow("identity_unverified");
    addAction("corroborate_identity");
  }

  // Situs
  if (websiteStatus === "AUTHENTIC") green("website_matches_official", {}, ["hijack.website"]);
  else if (websiteStatus === "AUTHORIZED_MIGRATION") green("website_authorized_migration", {}, ["hijack.website"]);
  else if (websiteStatus === "SUSPICIOUS") {
    yellow("website_suspicious", { domain: String(suspicious!.data.submittedDomain ?? "") }, ["hijack.website"]);
    addAction("confirm_or_dismiss_clone");
  } else if (websiteStatus === "UNVERIFIED") {
    yellow("website_unverified");
    addAction("establish_official_domain");
  }
  for (const e of otherHijack) {
    if (confirmed(e) && !impersonation) info("hijack_other_confirmed", {}, [e.key]);
    else if (!confirmed(e)) {
      yellow("hijack_flag_pending", { key: e.key }, [e.key]);
      addAction("review_hijack_flag");
    }
  }

  // Prediktor
  let predatoryAssessment: PredatoryAssessment = predatoryChecked ? "NO_CONCERNS_FOUND" : "NOT_ASSESSED";
  if (criticalIndicator) predatoryAssessment = "CONFIRMED_VIOLATION";
  else {
    const bealPending = beall.filter((e) => e.status === "REPORTED_UNVERIFIED" && e.review !== "DISMISSED");
    if (bealPending.length) {
      predatoryAssessment = "REVIEW_REQUIRED";
      const yr = String(bealPending[0].data.year ?? bealPending[0].sourceDataDate?.slice(0, 4) ?? "?");
      if (bealPending.some(confirmed)) yellow("beall_concern_confirmed", { year: yr }, ["beall.match"]);
      else yellow("beall_historical_review", { year: yr }, ["beall.match"]);
      info("beall_not_automatic");
      addAction("review_beall_match");
    }
    if (seriousIndicators.length) {
      predatoryAssessment = "REVIEW_REQUIRED";
      yellow("predatory_indicators_verified", { n: seriousIndicators.length }, ["predatory.indicator"]);
      addAction("review_predatory_indicators");
    }
    const pendingOthers = evidence.filter((e) => e.check === "PREDATORY" && e.key !== "beall.match" && e.key !== "predatory.indicator" && pending(e));
    if (pendingOthers.length) {
      predatoryAssessment = "REVIEW_REQUIRED";
      yellow("predatory_signal_pending", { n: pendingOthers.length });
    }
    if (predatoryAssessment === "NOT_ASSESSED") {
      info("predatory_not_assessed");
      addAction("record_predatory_review");
    }
  }

  // Bukti lain menunggu konfirmasi manusia (selain yang sudah ditangani)
  const handledKeys = new Set(["hijack.website", "beall.match", "predatory.indicator"]);
  const otherPending = evidence.filter(
    (e) => pending(e) && !handledKeys.has(e.key) && !e.key.startsWith("hijack.") && !e.key.startsWith("identity.") && e.check !== "PREDATORY",
  );
  if (otherPending.length) {
    yellow("pending_human_confirmation", { n: otherPending.length }, otherPending.map((e) => e.key));
    addAction("confirm_pending_evidence");
  }

  // Eskalasi
  const needsEscalation = evidence.some(
    (e) => policy.escalationEvidenceKeys.includes(e.key) && e.review !== "DISMISSED" &&
      (e.status === "VERIFIED" || e.status === "CONFLICTED" || e.requiresHumanConfirmation) &&
      !(e.key === "hijack.website" && (e.data.relation === "MATCHES_OFFICIAL" || e.data.relation === "AUTHORIZED_MIGRATION" || e.data.relation === "NO_SUBMITTED" || e.data.relation === "NO_OFFICIAL_DOMAIN")),
  );
  if (needsEscalation) addAction("escalate_investigation");

  // ---------- Status akhir jurnal ----------
  let journalStatus: JournalDecision["journalStatus"];
  if (redCategory === "CRITICAL_INTEGRITY") journalStatus = "RED";
  else if (eligibility === "INELIGIBLE") {
    journalStatus = "RED";
    redCategory = "POLICY_INELIGIBLE";
  } else if (reasons.some((r) => r.level === "YELLOW")) journalStatus = "YELLOW";
  else if (identityStatus === "CORROBORATED" && (websiteStatus === "AUTHENTIC" || websiteStatus === "AUTHORIZED_MIGRATION") && eligibility === "ELIGIBLE") {
    journalStatus = "GREEN";
    addAction("none_required");
  } else {
    // Pengaman: tanpa bukti lengkap tidak pernah HIJAU.
    journalStatus = "YELLOW";
    yellow("insufficient_evidence");
  }
  if (journalStatus === "YELLOW" && actions.length === 0) addAction("gather_more_evidence");

  return {
    journalStatus, redCategory: journalStatus === "RED" ? redCategory : null, identityStatus, websiteStatus, indexingStatus,
    indexingBasis, indexingDataDate, policyEligibility: eligibility, predatoryAssessment, identityFraudBlock, needsEscalation,
    reasons, nextActions: actions,
  };
}
