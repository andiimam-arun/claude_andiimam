import { makeEvidence } from "../engine/evidence";
import { compareDomains, extractHostname, lookalike, registrableDomain } from "../engine/domain";
import type { EvidenceRecord, IntegrationState } from "../engine/types";

const RANK: Record<IntegrationState, number> = { LIVE_VERIFIED: 4, MANUAL_EVIDENCE: 3, IMPORTED_DATA: 2, ERROR: 1, UNAVAILABLE: 0 };

export interface HijackRef {
  datasetId: string; datasetVersion: string; datasetDate: string | null; datasetName: string;
  title: string; authenticUrl?: string | null; hijackedUrl?: string | null; note?: string | null;
}

/** Domain resmi: dari bukti `identity.official_domain` terverifikasi + URL otentik pada daftar rujukan pembajakan yang diimpor. */
export function officialDomainsFrom(evidence: EvidenceRecord[], refs: HijackRef[]): { domains: string[]; best: IntegrationState | null; sources: string[] } {
  const set = new Map<string, IntegrationState>();
  const sources: string[] = [];
  for (const e of evidence) {
    if (e.key !== "identity.official_domain" || e.status !== "VERIFIED") continue;
    for (const d of (e.data.domains ?? []) as string[]) {
      const rd = registrableDomain(d);
      if (rd && (RANK[e.integration] > RANK[set.get(rd) ?? "UNAVAILABLE"] || !set.has(rd))) set.set(rd, e.integration);
    }
    sources.push(e.sourceName);
  }
  for (const r of refs) {
    const rd = registrableDomain(r.authenticUrl);
    if (rd && !set.has(rd)) { set.set(rd, "IMPORTED_DATA"); sources.push(r.datasetName); }
  }
  const best = [...set.values()].sort((a, b) => RANK[b] - RANK[a])[0] ?? null;
  return { domains: [...set.keys()], best, sources: [...new Set(sources)] };
}

export function buildHijackEvidence(opts: { submittedUrl: string | null | undefined; evidence: EvidenceRecord[]; refs: HijackRef[]; hasHijackDataset: boolean }): EvidenceRecord[] {
  const { submittedUrl, evidence, refs, hasHijackDataset } = opts;
  const sd = registrableDomain(submittedUrl);
  const out: EvidenceRecord[] = [];
  if (!sd) {
    out.push(makeEvidence({
      check: "HIJACK", key: "hijack.website", finding: "Situs yang diajukan tidak diberikan atau tidak valid; tidak dapat dibandingkan dengan situs resmi.", status: "UNAVAILABLE", integration: "UNAVAILABLE",
      sourceName: "Input pemohon", explanation: "Minta mahasiswa memberikan URL beranda/sistem pengiriman jurnal yang akan dipakai.", data: { relation: "NO_SUBMITTED", submittedDomain: null }, fingerprintSeed: "no-submitted",
    }));
    return out;
  }
  // Bukti manual untuk domain yang sama menggantikan perbandingan otomatis.
  if (evidence.some((e) => e.key === "hijack.website" && e.origin === "MANUAL" && e.data.submittedDomain === sd)) return out;

  const { domains: officials, best, sources } = officialDomainsFrom(evidence, refs);
  const base = { check: "HIJACK" as const, key: "hijack.website", sourceName: "Perbandingan domain" };

  const fakeHit = refs.find((r) => registrableDomain(r.hijackedUrl) === sd);
  if (fakeHit) {
    out.push(makeEvidence({
      ...base, sourceName: `${fakeHit.datasetName} (${fakeHit.datasetVersion})`, finding: `Domain ${sd} tercantum sebagai situs jurnal yang dibajak/ditiru untuk "${fakeHit.title}".`,
      status: "REPORTED_UNVERIFIED", integration: "IMPORTED_DATA", sourceDataDate: fakeHit.datasetDate, severity: "HIGH", strength: "MODERATE", requiresHumanConfirmation: true,
      extracted: `situs otentik: ${fakeHit.authenticUrl ?? "?"}; situs tiruan: ${fakeHit.hijackedUrl}`,
      explanation: "Kecocokan pada daftar rujukan pembajakan yang diimpor. Konfirmasi manusia (mis. via Retraction Watch Hijacked Journal Checker) diperlukan sebelum situs ditandai tidak aman.",
      data: { relation: "REPORTED_CLONE", submittedDomain: sd, officialDomains: officials, authentic: fakeHit.authenticUrl ?? null }, fingerprintSeed: `fake|${sd}|${fakeHit.title}`,
    }));
    return out;
  }
  if (officials.includes(sd)) {
    out.push(makeEvidence({
      ...base, finding: `Domain ${sd} sama dengan domain resmi jurnal yang telah terverifikasi (${officials.join(", ")}).`, status: "VERIFIED", integration: best ?? "IMPORTED_DATA",
      sourceName: sources.join("; ") || "Domain resmi terverifikasi", explanation: "Domain yang diajukan cocok dengan domain resmi dari sumber independen — bukan dari mahasiswa.",
      strength: best === "LIVE_VERIFIED" ? "STRONG" : "MODERATE", data: { relation: "MATCHES_OFFICIAL", submittedDomain: sd, officialDomains: officials }, fingerprintSeed: `match|${sd}`,
    }));
    return out;
  }
  if (officials.length === 0) {
    out.push(makeEvidence({
      ...base, finding: `Domain resmi jurnal belum dapat ditetapkan dari sumber independen; ${sd} belum bisa diverifikasi.`, status: "UNAVAILABLE", integration: "UNAVAILABLE",
      explanation: `Tambahkan bukti domain resmi (halaman penerbit/indeks resmi)${hasHijackDataset ? "" : " dan impor daftar rujukan pembajakan"} melalui Sumber Rujukan atau bukti manual. Ketiadaan data bukan bukti penipuan.`,
      data: { relation: "NO_OFFICIAL_DOMAIN", submittedDomain: sd, officialDomains: [] }, fingerprintSeed: `no-official|${sd}`,
    }));
    return out;
  }
  const lk = lookalike(sd, officials);
  out.push(makeEvidence({
    ...base, finding: lk.similar
      ? `Domain ${sd} berbeda dari domain resmi (${officials.join(", ")}) namun sangat mirip (${lk.reason}; terdekat: ${lk.closest}).`
      : `Domain ${sd} berbeda dari domain resmi yang terverifikasi (${officials.join(", ")}).`,
    status: "REPORTED_UNVERIFIED", integration: "IMPORTED_DATA", severity: lk.similar ? "HIGH" : "MEDIUM", strength: lk.similar ? "MODERATE" : "WEAK", requiresHumanConfirmation: true,
    explanation: "Perbedaan domain dapat berarti migrasi resmi, subdomain penerbit, atau situs tiruan. Domain yang baru terdaftar tidak otomatis curang. Peninjau harus memverifikasi (mis. pernyataan penerbit) lalu mengonfirmasi atau menolak.",
    data: { relation: lk.similar ? "LOOKALIKE" : "DIFFERENT_DOMAIN", submittedDomain: sd, officialDomains: officials, lookalike: lk }, fingerprintSeed: `diff|${sd}|${officials.join(",")}`,
  }));
  return out;
}

/** Ekstraksi fakta halaman (regex saja). Teks halaman adalah DATA tidak tepercaya dan tidak pernah dieksekusi/diikuti. */
export function inspectPageText(html: string, journalIssns: string[]): { title: string | null; issnsOnPage: string[]; mentionsJournalIssn: boolean } {
  const title = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const found = Array.from(new Set((html.match(/\b\d{4}-\d{3}[\dXx]\b/g) ?? []).map((s) => s.toUpperCase())));
  return { title, issnsOnPage: found, mentionsJournalIssn: found.some((f) => journalIssns.includes(f)) };
}

export { compareDomains, extractHostname };
