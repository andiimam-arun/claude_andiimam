import { makeEvidence } from "../engine/evidence";
import type { EvidenceRecord } from "../engine/types";
import { normalizeIssn } from "../engine/issn";
import { safeFetch } from "../security/safeFetch";

/**
 * TITIK EKSTENSI Fase 2 — Scopus Serial Title API (Elsevier), hanya aktif bila SCOPUS_API_KEY tersedia dan berlisensi.
 * Catatan jujur: API ini memberi metadata judul & rentang cakupan; penurunan status ACTIVE/DISCONTINUED dari rentang tahun
 * adalah INFERENSI, sehingga catatan selalu menuntut konfirmasi manusia. Belum diuji terhadap API langsung dalam build ini.
 */
export async function lookupScopusApi(issn: string | null): Promise<EvidenceRecord | null> {
  const key = process.env.SCOPUS_API_KEY;
  const n = normalizeIssn(issn);
  if (!key || !n) return null;
  const url = `https://api.elsevier.com/content/serial/title/issn/${n}`;
  try {
    const r = await safeFetch(`${url}?apiKey=${encodeURIComponent(key)}`, { timeoutMs: 10000, maxBytes: 300_000, headers: { accept: "application/json" } });
    if (r.status === 404) {
      return makeEvidence({ check: "SCOPUS", key: "scopus.coverage", finding: `ISSN ${n} tidak ditemukan di Scopus Serial Title API.`, status: "NOT_FOUND", integration: "LIVE_VERIFIED", sourceName: "Scopus Serial Title API", sourceUrl: url,
        explanation: "Respons 404 dari API berlisensi. Tinjau manual sebelum menyimpulkan.", severity: "MEDIUM", strength: "MODERATE", requiresHumanConfirmation: true, data: { conclusive: false }, fingerprintSeed: `scopus-api-nf|${n}` });
    }
    if (!r.ok) return null;
    const e = JSON.parse(r.text)?.["serial-metadata-response"]?.entry?.[0];
    if (!e) return null;
    const end = Number(e.coverageEndYear ?? e["coverageEndYear"] ?? 0) || null;
    const thisYear = new Date().getFullYear();
    const coverage = end && end < thisYear - 1 ? "DISCONTINUED" : "ACTIVE";
    return makeEvidence({
      check: "SCOPUS", key: "scopus.coverage", finding: `Scopus API: "${e["dc:title"]}" cakupan ${e.coverageStartYear ?? "?"}–${end ?? "kini"}.`, status: "VERIFIED", integration: "LIVE_VERIFIED",
      sourceName: "Scopus Serial Title API", sourceUrl: url, sourceDataDate: new Date().toISOString(), extracted: JSON.stringify({ title: e["dc:title"], publisher: e["dc:publisher"], sourceId: e["source-id"], start: e.coverageStartYear, end }),
      explanation: "Status diturunkan dari tahun akhir cakupan (inferensi); konfirmasi manusia diwajibkan.", severity: "INFO", strength: "MODERATE", requiresHumanConfirmation: true,
      data: { coverage, coverageTo: end, sourceId: e["source-id"], publisher: e["dc:publisher"], derived: true }, fingerprintSeed: `scopus-api|${n}|${coverage}`,
    });
  } catch {
    return null;
  }
}
