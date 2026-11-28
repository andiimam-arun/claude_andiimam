import { makeEvidence } from "../engine/evidence";
import { compareHosts, lookalike, normalizeDestination, registrableDomain, type OfficialHost } from "../engine/domain";
import type { EvidenceRecord, IntegrationState } from "../engine/types";

const RANK: Record<IntegrationState, number> = { LIVE_VERIFIED: 4, MANUAL_EVIDENCE: 3, IMPORTED_DATA: 2, ERROR: 1, UNAVAILABLE: 0 };

export interface HijackRef {
  datasetId: string; datasetVersion: string; datasetDate: string | null; datasetName: string;
  title: string; authenticUrl?: string | null; hijackedUrl?: string | null; note?: string | null;
}

/** Temuan tujuan aktif (baris terbaru per host yang bukan RETRACTED) + indikasi koreksi. */
export interface ActiveFinding {
  id: string; host: string; status: "CLONE_CONFIRMED" | "AUTHENTIC_VERIFIED" | "MIGRATION_VERIFIED" | "PLATFORM_VERIFIED";
  basis: string; sourceName: string; sourceUrl: string | null; sourceRef: string | null; sourceDataDate: string | null;
  includeSubdomains: boolean; createdByName: string; createdAt: string; evidenceFingerprint: string | null; isDemo: boolean;
}

export interface OfficialHostInfo extends OfficialHost { integration: IntegrationState; sourceName: string }

/** Host resmi: bukti `identity.official_domain` terverifikasi + URL otentik pada daftar rujukan impor. Perbandingan memakai HOST persis. */
export function officialHostsFrom(evidence: EvidenceRecord[], refs: HijackRef[]): OfficialHostInfo[] {
  const out = new Map<string, OfficialHostInfo>();
  const put = (url: string, integration: IntegrationState, sourceName: string, includeSubdomains: boolean) => {
    const n = normalizeDestination(url);
    if (!n.ok || !n.host) return;
    const cur = out.get(n.host);
    if (!cur || RANK[integration] > RANK[cur.integration]) out.set(n.host, { host: n.host, includeSubdomains: includeSubdomains || cur?.includeSubdomains, integration, sourceName });
  };
  for (const e of evidence) {
    if (e.key !== "identity.official_domain" || e.status !== "VERIFIED") continue;
    for (const d of (e.data.domains ?? []) as string[]) put(d, e.integration, e.sourceName, !!e.data.includeSubdomains);
  }
  for (const r of refs) if (r.authenticUrl) put(r.authenticUrl, "IMPORTED_DATA", r.datasetName, false);
  return [...out.values()];
}

export function buildHijackEvidence(opts: {
  submittedUrl: string | null | undefined; evidence: EvidenceRecord[]; refs: HijackRef[]; hasHijackDataset: boolean;
  findings?: ActiveFinding[]; retractedHosts?: Set<string>;
}): EvidenceRecord[] {
  const { submittedUrl, evidence, refs, hasHijackDataset } = opts;
  const findings = opts.findings ?? [];
  const retracted = opts.retractedHosts ?? new Set<string>();
  const sub = normalizeDestination(submittedUrl);
  const out: EvidenceRecord[] = [];
  if (!sub.ok || !sub.host) {
    out.push(makeEvidence({
      check: "HIJACK", key: "hijack.website", finding: sub.problems.includes("EMPTY") || sub.problems.length === 0
        ? "Tujuan pengiriman tidak diberikan; tidak dapat dibandingkan dengan situs resmi."
        : `Tujuan pengiriman tidak valid/tidak aman (${sub.problems.join(", ")}); tidak dapat dibandingkan.`,
      status: "UNAVAILABLE", integration: "UNAVAILABLE", sourceName: "Input pemohon",
      explanation: "Minta mahasiswa memberikan URL beranda/sistem pengiriman jurnal yang akan dipakai.", data: { relation: "NO_SUBMITTED", submittedDomain: null, submittedHost: null }, fingerprintSeed: `no-submitted|${sub.problems.join(",")}`,
    }));
    return out;
  }
  const host = sub.host;
  const base = { check: "HIJACK" as const, key: "hijack.website", sourceName: "Perbandingan host persis" };
  const officials = officialHostsFrom(evidence, refs);
  const officialList = officials.map((o) => o.host);
  const common = { submittedDomain: sub.registrable, submittedHost: host, officialDomains: officialList, officialHosts: officialList };

  if (sub.problems.some((p) => ["CREDENTIALS_IN_URL", "NON_STANDARD_PORT", "IP_HOST"].includes(p))) {
    out.push(makeEvidence({
      ...base, key: "hijack.url_format", finding: `URL tujuan memuat unsur tidak lazim (${sub.problems.join(", ")}). Normalisasi memakai host persis "${host}".`, status: "REPORTED_UNVERIFIED", integration: "UNAVAILABLE",
      sourceName: "Normalisasi URL", severity: "LOW", strength: "WEAK", explanation: "Hanya petunjuk peninjauan; bukan bukti penipuan.", data: { problems: sub.problems, submittedHost: host }, fingerprintSeed: `fmt|${host}|${sub.problems.join(",")}`,
    }));
  }

  // 1. Temuan tujuan permanen (host persis) mendahului perbandingan otomatis.
  const f = findings.find((x) => x.host === host);
  if (f) {
    const rel = f.status === "CLONE_CONFIRMED" ? "CONFIRMED_CLONE" : f.status === "AUTHENTIC_VERIFIED" ? "MATCHES_OFFICIAL" : f.status === "MIGRATION_VERIFIED" ? "AUTHORIZED_MIGRATION" : "PLATFORM_VERIFIED";
    out.push(makeEvidence({
      ...base, sourceName: f.sourceName + (f.isDemo ? " [FIKTIF]" : ""), sourceUrl: f.sourceUrl, sourceRef: f.sourceRef, sourceDataDate: f.sourceDataDate,
      finding: `Temuan tujuan terdokumentasi untuk host ${host}: ${f.status} — ${f.basis}`, status: "VERIFIED", integration: "MANUAL_EVIDENCE",
      severity: f.status === "CLONE_CONFIRMED" ? "CRITICAL" : "INFO", strength: "STRONG", explanation: `Dicatat oleh ${f.createdByName} pada ${f.createdAt.slice(0, 10)}. Temuan bersifat permanen per host dan hanya dapat dikoreksi melalui proses koreksi terdokumentasi.`,
      data: { relation: rel, findingId: f.id, demo: f.isDemo, ...common }, fingerprintSeed: `finding|${f.id}`,
    }));
    return out;
  }
  const wasRetracted = retracted.has(host);
  const mk = (e: ReturnType<typeof makeEvidence>) => (wasRetracted ? { ...e, review: "DISMISSED" as const, explanation: `${e.explanation} [Temuan klon sebelumnya pada host ini telah DIKOREKSI; riwayat dipertahankan.]`, data: { ...e.data, retractedFinding: true } } : e);

  // 2. Daftar rujukan pembajakan (host tiruan persis)
  const fakeHit = refs.find((r) => normalizeDestination(r.hijackedUrl).host === host);
  if (fakeHit) {
    out.push(mk(makeEvidence({
      ...base, sourceName: `${fakeHit.datasetName} (${fakeHit.datasetVersion})`, finding: `Host ${host} tercantum sebagai situs jurnal yang dibajak/ditiru untuk "${fakeHit.title}".`,
      status: "REPORTED_UNVERIFIED", integration: "IMPORTED_DATA", sourceDataDate: fakeHit.datasetDate, severity: "HIGH", strength: "MODERATE", requiresHumanConfirmation: true,
      extracted: `situs otentik: ${fakeHit.authenticUrl ?? "?"}; situs tiruan: ${fakeHit.hijackedUrl}`,
      explanation: "Kecocokan pada daftar rujukan yang diimpor. Konfirmasi manusia (mis. via Retraction Watch Hijacked Journal Checker) diperlukan sebelum tujuan ditandai tidak aman.",
      data: { relation: "REPORTED_CLONE", authentic: fakeHit.authenticUrl ?? null, ...common }, fingerprintSeed: `fake|${host}|${fakeHit.title}`,
    })));
    return out;
  }
  // 3. Perbandingan host persis dengan host resmi
  const rel = compareHosts(submittedUrl, officials);
  if (rel === "EXACT" || rel === "OFFICIAL_SUBDOMAIN") {
    const best = officials.filter((o) => o.host === host || (o.includeSubdomains && host.endsWith("." + o.host))).sort((a, b) => RANK[b.integration] - RANK[a.integration])[0];
    out.push(makeEvidence({
      ...base, finding: `Host ${host} ${rel === "EXACT" ? "sama persis dengan" : "adalah subdomain yang dinyatakan termasuk dalam"} host resmi terverifikasi (${officialList.join(", ")}).`, status: "VERIFIED", integration: best.integration,
      sourceName: best.sourceName, explanation: "Cocok dengan host resmi dari sumber independen — bukan dari mahasiswa.", strength: best.integration === "LIVE_VERIFIED" ? "STRONG" : "MODERATE",
      data: { relation: "MATCHES_OFFICIAL", ...common }, fingerprintSeed: `match|${host}`,
    }));
    return out;
  }
  if (rel === "NO_OFFICIAL") {
    out.push(makeEvidence({
      ...base, finding: `Host resmi jurnal belum dapat ditetapkan dari sumber independen; ${host} belum bisa diverifikasi.`, status: "UNAVAILABLE", integration: "UNAVAILABLE",
      explanation: `Tambahkan bukti host resmi (halaman penerbit/indeks resmi)${hasHijackDataset ? "" : " dan impor daftar rujukan pembajakan"} atau catat temuan tujuan. Ketiadaan data bukan bukti penipuan.`,
      data: { relation: "NO_OFFICIAL_DOMAIN", ...common, officialDomains: [] }, fingerprintSeed: `no-official|${host}`,
    }));
    return out;
  }
  if (rel === "SAME_REGISTRABLE_OTHER_HOST") {
    out.push(mk(makeEvidence({
      ...base, finding: `Host ${host} berada pada domain terdaftar yang sama dengan host resmi (${officialList.join(", ")}) tetapi BUKAN host yang sama (subdomain/pengalihan/platform lain).`, status: "REPORTED_UNVERIFIED", integration: "IMPORTED_DATA",
      severity: "LOW", strength: "WEAK", requiresHumanConfirmation: true,
      explanation: "Subdomain penerbit yang sah sering dipakai untuk sistem pengiriman, tetapi host ini belum diverifikasi. Bukan temuan penipuan; verifikasi lalu catat temuan tujuan.",
      data: { relation: "SUBDOMAIN_UNRESOLVED", ...common }, fingerprintSeed: `sub|${host}|${officialList.join(",")}`,
    })));
    return out;
  }
  const lk = lookalike(host, officialList);
  out.push(mk(makeEvidence({
    ...base, finding: lk.similar
      ? `Host ${host} berbeda dari host resmi (${officialList.join(", ")}) namun sangat mirip (${lk.reason}; terdekat: ${lk.closest}).`
      : `Host ${host} berbeda dari host resmi yang terverifikasi (${officialList.join(", ")}); belum terselesaikan (migrasi, platform eksternal, atau pengalihan belum diverifikasi).`,
    status: "REPORTED_UNVERIFIED", integration: "IMPORTED_DATA", severity: lk.similar ? "HIGH" : "LOW", strength: lk.similar ? "MODERATE" : "WEAK", requiresHumanConfirmation: true,
    explanation: lk.similar
      ? "Kemiripan mencurigakan hanyalah sinyal; domain baru tidak otomatis curang. Verifikasi lalu konfirmasi atau tolak."
      : "Perbedaan domain saja BUKAN temuan penipuan. Dapat berupa migrasi resmi atau platform pengiriman eksternal; verifikasi dan catat temuan tujuan.",
    data: { relation: lk.similar ? "LOOKALIKE" : "DIFFERENT_DOMAIN", lookalike: lk, ...common }, fingerprintSeed: `diff|${host}|${officialList.join(",")}`,
  })));
  return out;
}

/** Ekstraksi fakta halaman (regex saja). Teks halaman adalah DATA tidak tepercaya dan tidak pernah dieksekusi/diikuti. */
export function inspectPageText(html: string, journalIssns: string[]): { title: string | null; issnsOnPage: string[]; mentionsJournalIssn: boolean } {
  const title = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const found = Array.from(new Set((html.match(/\b\d{4}-\d{3}[\dXx]\b/g) ?? []).map((s) => s.toUpperCase())));
  return { title, issnsOnPage: found, mentionsJournalIssn: found.some((f) => journalIssns.includes(f)) };
}

export { registrableDomain };
