import { prisma } from "../db";
import type { Evidence } from "@prisma/client";
import { decideJournal } from "../engine/decision";
import { makeEvidence } from "../engine/evidence";
import { isValidIssn, normalizeIssn } from "../engine/issn";
import { titleSimilarity } from "../engine/extract";
import { registrableDomain } from "../engine/domain";
import type { EvidenceRecord, JournalDecision, JournalIdentityInput, PolicyConfig } from "../engine/types";
import { normalizeTitle, parseJson } from "../engine/util";
import { audit, type Actor } from "./audit";
import { getActivePolicy, type ActivePolicy } from "./policyService";
import { lookupReference } from "./reference";
import { searchRegistry, upsertJournal } from "./journalRegistry";
import { lookupCrossref, lookupDoaj } from "./externalSources";
import { lookupScopusApi } from "./scopusApi";
import { buildHijackEvidence, type HijackRef } from "./hijack";
import { activeFindings, recordFinding, type FindingStatus } from "./destinationFindings";
import { getMode, isPilot } from "../mode";
import { lookupScopusImport, scopusImportEvidence } from "./scopusReference";

export function rowToEvidence(r: Evidence, review?: "CONFIRMED" | "DISMISSED" | null): EvidenceRecord {
  const base = r.requiresHuman ? "PENDING" : "NOT_REQUIRED";
  return {
    id: r.id, check: r.check as any, key: r.key, finding: r.finding, status: r.status as any, integration: r.integration as any, sourceName: r.sourceName,
    sourceUrl: r.sourceUrl, sourceRef: r.sourceRef, retrievedAt: r.retrievedAt.toISOString(), sourceDataDate: r.sourceDataDate, extracted: r.extracted,
    explanation: r.explanation, severity: r.severity as any, strength: r.strength as any, requiresHumanConfirmation: r.requiresHuman,
    review: (review ?? base) as any, data: parseJson(r.dataJson, {}), fingerprint: r.fingerprint, origin: r.origin as any,
  };
}

async function latestReviews(journalId: string) {
  const rs = await prisma.evidenceReview.findMany({ where: { journalId }, orderBy: { createdAt: "asc" } });
  const m = new Map<string, "CONFIRMED" | "DISMISSED">();
  for (const r of rs) m.set(r.fingerprint, r.decision as any); // yang terbaru menimpa
  return m;
}

function applyReviews(evs: EvidenceRecord[], reviews: Map<string, "CONFIRMED" | "DISMISSED">): EvidenceRecord[] {
  return evs.map((e) => (reviews.has(e.fingerprint) ? { ...e, review: reviews.get(e.fingerprint)! } : e));
}

export interface RunInput {
  identity: JournalIdentityInput;
  actor: Actor;
  policy?: ActivePolicy;
  isDemo?: boolean;
}

export async function collectAutoEvidence(identity: JournalIdentityInput, journalId: string, manual: EvidenceRecord[], cfg: PolicyConfig): Promise<EvidenceRecord[]> {
  const out: EvidenceRecord[] = [];
  const now = new Date();
  const issn = normalizeIssn(identity.issn);
  const eissn = normalizeIssn(identity.eissn);
  const claimsDoaj = identity.claimedIndexing.some((c) => /doaj/i.test(c));

  // --- Identitas dasar ---
  for (const [label, raw] of [["ISSN", identity.issn], ["E-ISSN", identity.eissn]] as const) {
    if (raw && !isValidIssn(raw)) {
      out.push(makeEvidence({
        check: "IDENTITY", key: "identity.issn_invalid", finding: `${label} "${raw}" tidak valid (format/digit pemeriksa).`, status: "CONFLICTED", integration: "MANUAL_EVIDENCE", sourceName: "Validasi ISSN (ISO 3297)",
        severity: "MEDIUM", requiresHumanConfirmation: true, explanation: "Dapat berupa salah ketik; periksa kembali pada situs penerbit atau portal ISSN.", data: { raw }, fingerprintSeed: `issn-invalid|${raw}`,
      }));
    }
  }
  const dup = (await searchRegistry({ issn, eissn, scopusSourceId: identity.scopusSourceId })).filter((m) => m.journal.id !== journalId && m.matchedBy.some((b) => b !== "TITLE"));
  for (const d of dup) {
    out.push(makeEvidence({
      check: "IDENTITY", key: "identity.duplicate_title", finding: `Identifier yang sama tercatat pada entri registri lain: "${d.journal.title}" (${d.matchedBy.join("/")}).`, status: "CONFLICTED", integration: "MANUAL_EVIDENCE",
      sourceName: "Registri jurnal institusi", severity: "MEDIUM", requiresHumanConfirmation: true, explanation: "ISSN yang sama pada dua entri dengan judul berbeda perlu diperiksa (duplikasi, perubahan judul, atau pemakaian ISSN oleh pihak lain).", data: { otherJournalId: d.journal.id }, fingerprintSeed: `dup|${d.journal.id}`,
    }));
  }

  // --- Scopus ---
  // Database referensi Scopus (impor workbook) lebih dahulu. Impor generik lama (mis. data demo fiktif) tetap dipakai hanya bila
  // workbook tidak memuat jurnal tersebut tetapi dataset lama memuatnya; selain itu "tidak ditemukan" berasal dari impor workbook.
  const si = await lookupScopusImport({ issn, eissn, sourceId: identity.scopusSourceId, title: identity.title });
  const emptyLegacy = { datasets: [] as any[], matches: [] as any[], matchedBy: null as null | "IDENTIFIER" | "TITLE" };
  const legacy = si.import && si.matches.length ? emptyLegacy : await lookupReference("SCOPUS_SOURCE_LIST", { issn, eissn, sourceId: identity.scopusSourceId, title: identity.title });
  const scopusHandled = !!si.import && (si.matches.length > 0 || legacy.matches.length === 0);
  if (scopusHandled) out.push(...scopusImportEvidence(identity, si));
  const sc = scopusHandled ? emptyLegacy : legacy;
  const scApi = await lookupScopusApi(issn ?? eissn);
  if (scApi) out.push(scApi);
  // Kebijakan impor: impor TERBARU (tanggal pengamatan) menggantikan impor lama untuk identifier yang sama; impor lama dipertahankan sebagai riwayat (bukan konflik).
  const dsTime = (id: string) => { const d = sc.datasets.find((x) => x.id === id)!; return (d.sourceDate ?? d.importedAt).getTime(); };
  const scSorted = [...sc.matches].sort((a, b) => dsTime(b.datasetId) - dsTime(a.datasetId));
  const scNewest = scSorted[0]?.datasetId;
  const scCurrent = scSorted.filter((m) => m.datasetId === scNewest);
  for (const m of scSorted.filter((x) => x.datasetId !== scNewest).slice(0, 2)) {
    const ds = sc.datasets.find((d) => d.id === m.datasetId)!;
    out.push(makeEvidence({
      check: "SCOPUS", key: "scopus.import_history", status: "REPORTED_UNVERIFIED", integration: "IMPORTED_DATA", severity: "INFO", strength: "WEAK",
      finding: `Impor lama (${ds.versionLabel}) mencatat status "${m.status ?? "?"}" untuk "${m.title}"; digantikan oleh impor yang lebih baru.`, sourceName: `Impor Scopus — ${ds.versionLabel}${ds.isDemo ? " [DATA DEMONSTRASI FIKTIF]" : ""}`, sourceDataDate: ds.sourceDate?.toISOString() ?? null,
      explanation: "Riwayat saja; tidak dihitung dalam keputusan karena impor yang lebih baru berlaku.", data: { datasetId: ds.id, status: m.status }, fingerprintSeed: `scopus-hist|${m.id}`,
    }));
  }
  if (scCurrent.length) {
    for (const m of scCurrent.slice(0, 3)) {
      const ds = sc.datasets.find((d) => d.id === m.datasetId)!;
      const st = (m.status ?? "").toLowerCase();
      const cov = st.startsWith("active") ? "ACTIVE" : st.startsWith("inactive") || st.includes("discontinued") ? "DISCONTINUED" : null;
      const d = parseJson<Record<string, any>>(m.dataJson, {});
      const weak = sc.matchedBy === "TITLE";
      out.push(makeEvidence({
        check: "SCOPUS", key: "scopus.coverage", integration: "IMPORTED_DATA",
        finding: weak ? `Judul cocok pada daftar sumber Scopus (tanpa identifier): "${m.title}" — status ${m.status ?? "?"}.` : `Daftar sumber Scopus: "${m.title}" — status ${m.status ?? "tidak tercantum"}${d.coverage ? `, cakupan ${d.coverage}` : ""}.`,
        status: weak ? "REPORTED_UNVERIFIED" : cov ? "VERIFIED" : "REPORTED_UNVERIFIED",
        sourceName: `Impor Scopus Source List — ${ds.versionLabel}${ds.isDemo ? " [DATA DEMONSTRASI FIKTIF]" : ""}`, sourceRef: `${ds.filename} (sha256 ${ds.sha256.slice(0, 12)}…)`,
        sourceDataDate: ds.sourceDate?.toISOString() ?? null, retrievedAt: now.toISOString(),
        extracted: JSON.stringify({ title: m.title, issn: m.issn, eissn: m.eissn, publisher: m.publisher, status: m.status, ...d }),
        explanation: `Berdasarkan IMPOR data historis (${ds.provenance}) — BUKAN verifikasi Scopus langsung. ${weak ? "Kecocokan hanya pada judul sehingga perlu konfirmasi manusia." : ""}`,
        severity: "INFO", strength: weak ? "WEAK" : "MODERATE", requiresHumanConfirmation: weak || !cov,
        data: { coverage: cov, coverageTo: d.coverage?.match(/(\d{4})\D*$/)?.[1], sourceId: m.sourceId, discontinuedDueToQuality: d.discontinuedQuality ?? null, matchedBy: sc.matchedBy, datasetId: ds.id, publisher: m.publisher, title: m.title },
        fingerprintSeed: `scopus-import|${m.id}`,
      }));
    }
  } else if (!scApi && !scopusHandled) {
    if (sc.datasets.length) {
      const ds = [...sc.datasets].sort((a, b) => (b.sourceDate ?? b.importedAt).getTime() - (a.sourceDate ?? a.importedAt).getTime())[0];
      out.push(makeEvidence({
        check: "SCOPUS", key: "scopus.coverage", status: "NOT_FOUND", integration: "IMPORTED_DATA",
        finding: `Tidak ditemukan pada daftar sumber Scopus yang diimpor (${ds.versionLabel}).`, sourceName: `Impor Scopus Source List — ${ds.versionLabel}${ds.isDemo ? " [DATA DEMONSTRASI FIKTIF]" : ""}`,
        sourceRef: ds.filename, sourceDataDate: ds.sourceDate?.toISOString() ?? null,
        explanation: "Ketiadaan pada impor historis BUKAN bukti negatif: jurnal mungkin ditambahkan setelah tanggal data, atau identifier berbeda. Verifikasi manual pada Scopus Sources diperlukan.",
        severity: "LOW", strength: "WEAK", data: { conclusive: false, datasetId: ds.id }, fingerprintSeed: `scopus-nf|${ds.id}`,
      }));
    } else {
      out.push(makeEvidence({
        check: "SCOPUS", key: "scopus.coverage", status: "UNAVAILABLE", integration: "UNAVAILABLE", finding: "Tidak ada impor Scopus Source List maupun akses API berlisensi; status indeksasi Scopus belum dapat diverifikasi.",
        sourceName: "Scopus (tidak tersedia)", explanation: "Impor file Source List yang diperoleh secara sah (Sumber Rujukan) atau tambahkan bukti manual dari Scopus Sources. Data yang hilang tidak diperlakukan sebagai bukti negatif.", severity: "INFO", strength: "NONE", fingerprintSeed: "scopus-unavailable",
      }));
    }
  }
  // Perbandingan identitas dengan rekaman Scopus
  const best = scCurrent[0];
  if (best && sc.matchedBy === "IDENTIFIER") {
    if (titleSimilarity(best.title, identity.title) < 0.6 && !identity.altTitles.some((a) => titleSimilarity(best.title, a) >= 0.6)) {
      out.push(makeEvidence({
        check: "IDENTITY", key: "identity.title_mismatch", status: "CONFLICTED", integration: "IMPORTED_DATA", sourceName: "Impor Scopus Source List",
        finding: `ISSN/ID cocok dengan "${best.title}" pada Scopus, tetapi judul yang diajukan "${identity.title}" berbeda.`, severity: "MEDIUM", requiresHumanConfirmation: true,
        explanation: "Bisa perubahan judul sah, kesalahan input, atau pemakaian ISSN jurnal lain.", data: { scopusTitle: best.title }, fingerprintSeed: `scopus-title|${best.id}|${normalizeTitle(identity.title)}`,
      }));
    } else {
      out.push(makeEvidence({
        check: "IDENTITY", key: "identity.corroboration", status: "VERIFIED", integration: "IMPORTED_DATA", sourceName: "Impor Scopus Source List", sourceDataDate: sc.datasets.find((d) => d.id === best.datasetId)?.sourceDate?.toISOString() ?? null,
        finding: `Identitas jurnal dicocokkan lewat identifier (ISSN/ID sumber) dengan "${best.title}" pada daftar sumber Scopus.`, strength: "MODERATE",
        explanation: "Kecocokan identifier + judul pada sumber rujukan yang diimpor.", data: { via: "SCOPUS_IMPORT" }, fingerprintSeed: `corr-scopus|${best.id}`,
      }));
    }
    if (identity.publisher && best.publisher && titleSimilarity(best.publisher, identity.publisher) < 0.4) {
      out.push(makeEvidence({
        check: "IDENTITY", key: "identity.publisher_mismatch", status: "CONFLICTED", integration: "IMPORTED_DATA", sourceName: "Impor Scopus Source List",
        finding: `Penerbit yang diajukan ("${identity.publisher}") berbeda dari catatan Scopus ("${best.publisher}").`, severity: "MEDIUM", requiresHumanConfirmation: true,
        explanation: "Dapat akibat pergantian penerbit atau penulisan berbeda; perlu verifikasi.", fingerprintSeed: `pub|${best.id}|${normalizeTitle(identity.publisher)}`,
      }));
    }
  }

  // --- SCImago ---
  const sj = await lookupReference("SCIMAGO", { issn, eissn, sourceId: identity.scopusSourceId, title: identity.title });
  if (sj.matches.length) {
    const m = sj.matches[0];
    const ds = sj.datasets.find((d) => d.id === m.datasetId)!;
    const d = parseJson<Record<string, any>>(m.dataJson, {});
    out.push(makeEvidence({
      check: "SCIMAGO", key: "scimago.entry", status: sj.matchedBy === "TITLE" ? "REPORTED_UNVERIFIED" : "VERIFIED", integration: "IMPORTED_DATA",
      finding: `SCImago: "${m.title}" — SJR ${d.sjr ?? "?"}, kuartil ${d.quartile ?? "?"}${d.year ? `, tahun ${d.year}` : ""}.`,
      sourceName: `Impor SCImago — ${ds.versionLabel}${ds.isDemo ? " [DATA DEMONSTRASI FIKTIF]" : ""}`, sourceRef: ds.filename, sourceDataDate: ds.sourceDate?.toISOString() ?? null,
      explanation: "SCImago adalah bukti historis pelengkap, BUKAN bukti definitif status Scopus saat ini.", strength: "MODERATE", requiresHumanConfirmation: sj.matchedBy === "TITLE",
      data: { found: true, quartile: d.quartile, sjr: d.sjr, year: d.year ? Number(d.year) : ds.sourceDate?.getFullYear(), categories: d.categories }, fingerprintSeed: `sjr|${m.id}`,
    }));
  } else if (sj.datasets.length) {
    out.push(makeEvidence({
      check: "SCIMAGO", key: "scimago.entry", status: "NOT_FOUND", integration: "IMPORTED_DATA", finding: "Tidak ada entri SJR pada impor SCImago.", sourceName: `Impor SCImago — ${sj.datasets[0].versionLabel}`,
      sourceDataDate: sj.datasets[0].sourceDate?.toISOString() ?? null, explanation: "Bukan bukti negatif; SCImago hanya memuat judul terindeks Scopus tertentu pada tahun laporan.", severity: "INFO", strength: "WEAK", data: { found: false }, fingerprintSeed: `sjr-nf|${sj.datasets[0].id}`,
    }));
  } else {
    out.push(makeEvidence({
      check: "SCIMAGO", key: "scimago.entry", status: "UNAVAILABLE", integration: "UNAVAILABLE", finding: "Tidak ada impor SCImago; gunakan bukti manual dari scimagojr.com bila kuartil relevan.",
      sourceName: "SCImago (tidak tersedia)", explanation: "Tidak ada integrasi langsung (tanpa scraping konten terproteksi).", strength: "NONE", fingerprintSeed: "sjr-unavailable",
    }));
  }

  // --- Beall (historis) ---
  const bl = await lookupReference("BEALL", { issn, eissn, title: identity.title });
  if (bl.matches.length) {
    for (const m of bl.matches.slice(0, 2)) {
      const ds = bl.datasets.find((d) => d.id === m.datasetId)!;
      const d = parseJson<Record<string, any>>(m.dataJson, {});
      out.push(makeEvidence({
        check: "PREDATORY", key: "beall.match", status: "REPORTED_UNVERIFIED", integration: "IMPORTED_DATA", finding: `Judul/penerbit "${m.title}" muncul pada daftar historis Beall (${ds.versionLabel}).`,
        sourceName: `Impor daftar historis — ${ds.versionLabel}${ds.isDemo ? " [DATA DEMONSTRASI FIKTIF]" : ""}`, sourceRef: ds.filename, sourceDataDate: ds.sourceDate?.toISOString() ?? null, severity: "MEDIUM", strength: "WEAK", requiresHumanConfirmation: true,
        explanation: "Daftar Beall bersifat historis, tidak lagi dipelihara, dan tidak dapat berdiri sendiri sebagai bukti. Wajib ditinjau; nilai kekuatan & kemutakhiran buktinya.",
        data: { year: d.year ? Number(d.year) : ds.sourceDate?.getFullYear(), matchType: bl.matchedBy, listName: "Beall (historis)" }, fingerprintSeed: `beall|${m.id}`,
      }));
    }
  } else if (bl.datasets.length) {
    out.push(makeEvidence({
      check: "PREDATORY", key: "beall.match", status: "NOT_FOUND", integration: "IMPORTED_DATA", finding: "Tidak ditemukan pada daftar historis yang diimpor.", sourceName: `Impor daftar historis — ${bl.datasets[0].versionLabel}`,
      sourceDataDate: bl.datasets[0].sourceDate?.toISOString() ?? null, explanation: "Tidak adanya kecocokan hanya menyatakan tidak ada catatan historis, bukan jaminan kualitas.", strength: "WEAK", fingerprintSeed: `beall-nf|${bl.datasets[0].id}`,
    }));
  }

  // --- Metadata publik (DOAJ & Crossref) ---
  const [doaj, cr] = await Promise.all([lookupDoaj(issn ?? eissn, claimsDoaj), lookupCrossref(issn ?? eissn, identity.title)]);
  out.push(...doaj.evidence, ...cr.evidence);
  for (const [src, info] of [["DOAJ", doaj.info], ["Crossref", cr.info]] as const) {
    if (info?.found && info.title && titleSimilarity(info.title, identity.title) >= 0.6 && !out.some((e) => e.key === "identity.corroboration" && e.data.via === src)) {
      out.push(makeEvidence({
        check: "IDENTITY", key: "identity.corroboration", status: "VERIFIED", integration: "LIVE_VERIFIED", sourceName: `${src} API`, finding: `Identitas jurnal dikorroborasi oleh ${src} (ISSN + judul).`,
        strength: "MODERATE", data: { via: src }, fingerprintSeed: `corr|${src}|${info.title}`,
      }));
    }
  }

  // --- Domain / pembajakan ---
  const hj = await lookupReference("HIJACKED", { issn, eissn, title: identity.title });
  const refs: HijackRef[] = hj.matches.map((m) => {
    const ds = hj.datasets.find((d) => d.id === m.datasetId)!;
    const d = parseJson<Record<string, any>>(m.dataJson, {});
    return { datasetId: ds.id, datasetVersion: ds.versionLabel, datasetDate: ds.sourceDate?.toISOString() ?? null, datasetName: `Impor daftar jurnal dibajak${ds.isDemo ? " [DATA DEMONSTRASI FIKTIF]" : ""}`, title: m.title, authenticUrl: d.authenticUrl || m.url, hijackedUrl: d.hijackedUrl, note: d.note };
  });
  // Bukti domain resmi dari bukti otomatis (DOAJ) + manual
  const forHijack = [...manual, ...out];
  const fnd = await activeFindings(journalId);
  out.push(...buildHijackEvidence({ submittedUrl: identity.submittedWebsite, evidence: forHijack, refs, hasHijackDataset: hj.datasets.length > 0, findings: fnd.active, retractedHosts: fnd.retractedHosts }));
  if (!hj.datasets.length) {
    out.push(makeEvidence({
      check: "HIJACK", key: "hijack.reference", status: "UNAVAILABLE", integration: "UNAVAILABLE", finding: "Belum ada daftar rujukan jurnal dibajak yang diimpor (mis. dari Retraction Watch Hijacked Journal Checker).",
      sourceName: "Retraction Watch Hijacked Journal Checker (tidak terhubung)", sourceUrl: "https://retractionwatch.com/the-retraction-watch-hijacked-journal-checker/",
      explanation: "Lakukan pemeriksaan manual pada checker tersebut dan catat hasilnya sebagai bukti manual dengan tautan sumber.", strength: "NONE", fingerprintSeed: "hijack-ref-unavailable",
    }));
  }
  void cfg;
  // Bukti yang berasal dari dataset berpenanda DEMO ditandai (data.demo) agar tidak pernah memenuhi syarat klirens PILOT.
  const demoDatasets = new Set((await prisma.referenceDataset.findMany({ where: { isDemo: true }, select: { id: true } })).map((d) => d.id));
  return out.map((e) => (e.data?.datasetId && demoDatasets.has(e.data.datasetId)) || /\[DATA DEMONSTRASI FIKTIF\]|\[FIKTIF\]/.test(e.sourceName) ? { ...e, data: { ...e.data, demo: true } } : e);
}

export interface InvestigationResult {
  assessmentId: string; journalId: string; decision: JournalDecision; created: boolean; policyVersion: number;
}

function refNumber(prefix: string, n: number) {
  return `${prefix}-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
}

export async function runInvestigation(i: RunInput): Promise<InvestigationResult> {
  const policy = i.policy ?? (await getActivePolicy());
  const { journal, created } = await upsertJournal(i.identity, { isDemo: i.isDemo });
  const reviews = await latestReviews(journal.id);
  const manualRows = await prisma.evidence.findMany({ where: { journalId: journal.id, origin: "MANUAL", retracted: false }, orderBy: { createdAt: "asc" } });
  const manual = applyReviews(manualRows.map((r) => rowToEvidence(r)), reviews);
  const identity: JournalIdentityInput = {
    ...i.identity,
    issn: normalizeIssn(i.identity.issn) ?? i.identity.issn, eissn: normalizeIssn(i.identity.eissn) ?? i.identity.eissn,
    officialWebsite: journal.officialWebsite,
  };
  const autoRaw = await collectAutoEvidence(identity, journal.id, manual, policy.config);
  const auto = applyReviews(autoRaw, reviews);
  const all = [...auto, ...manual];
  const decision = decideJournal({ identity, evidence: all, policy: policy.config, pilotMode: isPilot() });

  const count = await prisma.assessment.count();
  const a = await prisma.assessment.create({
    data: {
      refNumber: refNumber("JD", count + 1), journalId: journal.id, submittedUrl: i.identity.submittedWebsite ?? null, submittedDomain: registrableDomain(i.identity.submittedWebsite),
      policyId: policy.id, policyVersion: policy.version, journalStatus: decision.journalStatus, decisionJson: JSON.stringify(decision), inputJson: JSON.stringify(identity), createdById: i.actor.id,
    },
  });
  const ids: string[] = manualRows.map((r) => r.id);
  for (const e of auto) {
    const row = await prisma.evidence.create({
      data: {
        journalId: journal.id, assessmentId: a.id, origin: "AUTO", check: e.check, key: e.key, finding: e.finding, status: e.status, integration: e.integration, sourceName: e.sourceName,
        sourceUrl: e.sourceUrl, sourceRef: e.sourceRef, retrievedAt: new Date(e.retrievedAt), sourceDataDate: e.sourceDataDate, extracted: e.extracted, explanation: e.explanation,
        severity: e.severity, strength: e.strength, requiresHuman: e.requiresHumanConfirmation, dataJson: JSON.stringify(e.data), fingerprint: e.fingerprint,
      },
    });
    ids.push(row.id);
  }
  await prisma.assessment.update({ where: { id: a.id }, data: { evidenceIdsJson: JSON.stringify(ids) } });

  const verifiedDomains = new Set<string>();
  for (const e of all) if (e.key === "identity.official_domain" && e.status === "VERIFIED") for (const d of (e.data.domains ?? []) as string[]) { const r = registrableDomain(d); if (r) verifiedDomains.add(r); }
  for (const e of all) if (e.key === "hijack.website" && ["MATCHES_OFFICIAL", "AUTHORIZED_MIGRATION"].includes(e.data.relation) && e.status === "VERIFIED") for (const d of (e.data.officialDomains ?? []) as string[]) { const r = registrableDomain(d); if (r) verifiedDomains.add(r); }
  const due = policy.config.reassessmentIntervalDays ? new Date(Date.now() + policy.config.reassessmentIntervalDays * 86_400_000) : null;
  await prisma.journal.update({
    where: { id: journal.id },
    data: {
      lastVerifiedAt: new Date(), verifiedDomainsJson: JSON.stringify([...verifiedDomains]), reassessDueAt: due,
      knownWarningsJson: JSON.stringify(Array.from(new Set(decision.reasons.filter((r) => (r.level === "RED" || r.level === "YELLOW") && r.scope !== "DESTINATION").map((r) => r.code)))),
      recordVersion: { increment: 0 },
    },
  });
  await audit(i.actor, "JOURNAL_ASSESSED", "Assessment", a.id, { journalId: journal.id, status: decision.journalStatus, created }, policy.version);
  return { assessmentId: a.id, journalId: journal.id, decision, created, policyVersion: policy.version };
}

/** Memuat penilaian beserta bukti lengkap (otomatis + manual yang dipakai saat itu), dengan status tinjauan terkini. */
export async function loadAssessment(id: string) {
  const a = await prisma.assessment.findUnique({ where: { id }, include: { journal: true } });
  if (!a) return null;
  const ids = parseJson<string[]>(a.evidenceIdsJson, []);
  const rows = await prisma.evidence.findMany({ where: { id: { in: ids } }, orderBy: [{ check: "asc" }, { createdAt: "asc" }] });
  const reviews = await latestReviews(a.journalId);
  const evidence = applyReviews(rows.map((r) => rowToEvidence(r)), reviews);
  return { assessment: a, journal: a.journal, evidence, decision: parseJson<JournalDecision>(a.decisionJson, null as any), input: parseJson<JournalIdentityInput>(a.inputJson, null as any) };
}

export const MANUAL_KINDS = [
  "scopus.coverage", "scimago.entry", "national.accreditation", "identity.official_domain", "identity.corroboration", "hijack.website",
  "hijack.issn_reuse", "hijack.identity_impersonation", "beall.match", "predatory.indicator", "metadata.cope", "metadata.doaj",
] as const;
export type ManualKind = (typeof MANUAL_KINDS)[number];

export const PREDATORY_INDICATORS = [
  "editorial_board_opaque", "peer_review_policy_missing", "ethics_retraction_policy_missing", "apc_not_transparent", "contact_info_missing",
  "unrealistic_publication_promise", "misleading_indexing_claim", "unverifiable_editors", "suspicious_solicitation", "suspicious_payment_pattern", "fake_editorial_board",
] as const;

export interface ManualEvidenceInput {
  journalId: string; kind: ManualKind; finding: string; status: "VERIFIED" | "REPORTED_UNVERIFIED" | "NOT_FOUND" | "CONFLICTED";
  sourceName: string; sourceUrl?: string; sourceRef?: string; sourceDataDate?: string; extracted?: string; explanation?: string;
  severity?: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; data: Record<string, any>; actor: Actor;
}

const KIND_CHECK: Record<ManualKind, EvidenceRecord["check"]> = {
  "scopus.coverage": "SCOPUS", "scimago.entry": "SCIMAGO", "national.accreditation": "NATIONAL", "identity.official_domain": "IDENTITY", "identity.corroboration": "IDENTITY",
  "hijack.website": "HIJACK", "hijack.issn_reuse": "HIJACK", "hijack.identity_impersonation": "HIJACK", "beall.match": "PREDATORY", "predatory.indicator": "PREDATORY",
  "metadata.cope": "METADATA", "metadata.doaj": "METADATA",
};

export async function addManualEvidence(i: ManualEvidenceInput) {
  if (!i.sourceName.trim()) throw new Error("Nama sumber wajib diisi");
  if (!i.finding.trim()) throw new Error("Temuan wajib diisi");
  if (i.status === "VERIFIED" && !(i.sourceUrl?.trim() || i.sourceRef?.trim())) throw new Error("Bukti berstatus VERIFIED wajib mencantumkan URL sumber atau referensi dokumen terunggah");
  if (i.sourceUrl && !/^https?:\/\//i.test(i.sourceUrl)) throw new Error("URL sumber harus diawali http(s)://");
  const data: Record<string, any> = { ...i.data, ...(getMode() === "DEMO" ? { demo: true } : {}) };
  if (i.kind === "identity.official_domain") data.domains = (data.domains as string[]).map((d) => d.trim()).filter(Boolean);
  if (i.kind === "hijack.website") {
    // Temuan tujuan disimpan sebagai temuan PERMANEN per host persis (bukan bukti biasa) — lihat destinationFindings.ts
    const rel = String(i.data.relation);
    const map: Record<string, FindingStatus> = { CONFIRMED_CLONE: "CLONE_CONFIRMED", AUTHORIZED_MIGRATION: "MIGRATION_VERIFIED", MATCHES_OFFICIAL: "AUTHENTIC_VERIFIED", PLATFORM_VERIFIED: "PLATFORM_VERIFIED" };
    if (!map[rel]) throw new Error("Hasil perbandingan tujuan tidak valid");
    if (i.status !== "VERIFIED") throw new Error("Temuan tujuan harus berstatus VERIFIED dengan sumber; untuk dugaan gunakan peninjauan bukti");
    return recordFinding({
      journalId: i.journalId, urlOrHost: String(i.data.submittedDomain ?? ""), status: map[rel], basis: i.finding, sourceName: i.sourceName, sourceUrl: i.sourceUrl, sourceRef: i.sourceRef,
      sourceDataDate: i.sourceDataDate ? new Date(i.sourceDataDate).toISOString() : null, includeSubdomains: !!i.data.includeSubdomains, actor: i.actor,
    });
  }
  const flagged = i.status === "REPORTED_UNVERIFIED" || (i.kind === "beall.match");
  const ev = makeEvidence({
    check: KIND_CHECK[i.kind], key: i.kind, finding: i.finding, status: i.status, integration: "MANUAL_EVIDENCE", sourceName: i.sourceName, sourceUrl: i.sourceUrl || null, sourceRef: i.sourceRef || null,
    sourceDataDate: i.sourceDataDate ? new Date(i.sourceDataDate).toISOString() : null, extracted: i.extracted, explanation: i.explanation ?? `Dicatat manual oleh ${i.actor.name}.`,
    severity: i.severity ?? "INFO", requiresHumanConfirmation: flagged, data, origin: "MANUAL",
    fingerprintSeed: `${i.kind}|${i.sourceName}|${i.sourceUrl ?? i.sourceRef ?? ""}|${JSON.stringify(data)}`,
  });
  const row = await prisma.evidence.create({
    data: {
      journalId: i.journalId, origin: "MANUAL", check: ev.check, key: ev.key, finding: ev.finding, status: ev.status, integration: ev.integration, sourceName: ev.sourceName, sourceUrl: ev.sourceUrl, sourceRef: ev.sourceRef,
      retrievedAt: new Date(), sourceDataDate: ev.sourceDataDate, extracted: ev.extracted, explanation: ev.explanation, severity: ev.severity, strength: ev.strength,
      requiresHuman: ev.requiresHumanConfirmation, dataJson: JSON.stringify(ev.data), fingerprint: ev.fingerprint, createdById: i.actor.id,
    },
  });
  await audit(i.actor, "EVIDENCE_ADDED_MANUAL", "Evidence", row.id, { journalId: i.journalId, kind: i.kind, status: i.status });
  return row;
}

export async function retractEvidence(id: string, actor: Actor, reason: string) {
  const e = await prisma.evidence.findUniqueOrThrow({ where: { id } });
  if (e.origin !== "MANUAL") throw new Error("Hanya bukti manual yang dapat ditarik");
  await prisma.evidence.update({ where: { id }, data: { retracted: true } });
  await audit(actor, "EVIDENCE_RETRACTED", "Evidence", id, { reason });
}

export async function reviewEvidence(opts: { journalId: string; fingerprint: string; decision: "CONFIRMED" | "DISMISSED"; note: string; actor: Actor }) {
  if (opts.note.trim().length < 10) throw new Error("Catatan peninjauan minimal 10 karakter");
  const r = await prisma.evidenceReview.create({
    data: { journalId: opts.journalId, fingerprint: opts.fingerprint, decision: opts.decision, note: opts.note.trim(), reviewerId: opts.actor.id, reviewerName: opts.actor.name },
  });
  await audit(opts.actor, "EVIDENCE_REVIEWED", "EvidenceReview", r.id, { journalId: opts.journalId, fingerprint: opts.fingerprint, decision: opts.decision, note: opts.note });
  // Konfirmasi dugaan klon/tujuan menjadi TEMUAN PERMANEN pada host persis tersebut (dengan asal-usul bukti).
  if (opts.decision === "CONFIRMED") {
    const ev = await prisma.evidence.findFirst({ where: { journalId: opts.journalId, fingerprint: opts.fingerprint, key: "hijack.website" }, orderBy: { createdAt: "desc" } });
    const host = ev ? (parseJson<any>(ev.dataJson, {}).submittedHost as string | undefined) : undefined;
    if (ev && host) {
      await recordFinding({ journalId: opts.journalId, urlOrHost: host, status: "CLONE_CONFIRMED", basis: `Dikonfirmasi peninjau: ${opts.note.trim()}`, sourceName: ev.sourceName, sourceUrl: ev.sourceUrl, sourceRef: ev.sourceRef ?? "bukti otomatis", sourceDataDate: ev.sourceDataDate, evidenceFingerprint: opts.fingerprint, actor: opts.actor });
    }
  }
  return r;
}

export async function flagForReassessment(journalId: string, actor: Actor, reason: string) {
  await prisma.journal.update({ where: { id: journalId }, data: { reassessFlag: true, reassessReason: reason } });
  await audit(actor, "JOURNAL_FLAGGED_REASSESS", "Journal", journalId, { reason });
}
