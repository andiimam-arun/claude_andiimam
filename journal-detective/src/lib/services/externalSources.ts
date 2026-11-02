import { makeEvidence } from "../engine/evidence";
import type { EvidenceRecord } from "../engine/types";
import { normalizeIssn } from "../engine/issn";
import { titleSimilarity } from "../engine/extract";
import { safeFetch } from "../security/safeFetch";

/**
 * Adapter sumber publik yang diizinkan: Crossref REST API & DOAJ API (keduanya API publik terbuka).
 * Host TETAP (tidak dari input pengguna). Bila jaringan/API tidak tersedia → status UNAVAILABLE/ERROR, bukan data karangan.
 */

export interface ExternalJournalInfo {
  doaj?: { found: boolean; title?: string; publisher?: string; homepage?: string; issns: string[]; apc?: boolean | null; seal?: boolean | null; raw?: unknown };
  crossref?: { found: boolean; title?: string; publisher?: string; issns: string[]; totalDois?: number; currentDois?: number; backfileDois?: number };
}

const DISABLED = () => process.env.DISABLE_EXTERNAL_LOOKUPS === "1";

/** Pesan galat HTTP yang dapat dibedakan (batas laju, galat server, dsb.). */
export function httpFailure(status: number, retryAfter?: string | null): string {
  if (status === 429) return `dibatasi laju oleh layanan (HTTP 429${retryAfter ? `, Retry-After ${retryAfter}` : ""})`;
  if (status === 403 || status === 401) return `akses ditolak (HTTP ${status})`;
  if (status >= 500) return `galat server layanan (HTTP ${status})`;
  return `HTTP ${status}`;
}

function unavailable(source: string, key: string, check: "METADATA", url: string, reason: string, state: "UNAVAILABLE" | "ERROR" = "UNAVAILABLE"): EvidenceRecord {
  return makeEvidence({
    check, key, finding: `${source}: tidak dapat diakses (${reason}).`, status: "UNAVAILABLE", integration: state,
    sourceName: source, sourceUrl: url, extracted: "",
    explanation: "Sumber tidak dapat dihubungi. Ketiadaan data BUKAN bukti negatif. Gunakan peninjauan bukti manual bila diperlukan.",
    severity: "INFO", strength: "NONE", fingerprintSeed: `unavail|${source}|${url}`,
  });
}

export async function lookupDoaj(issn: string | null, claimsDoaj: boolean): Promise<{ evidence: EvidenceRecord[]; info?: ExternalJournalInfo["doaj"] }> {
  const n = normalizeIssn(issn);
  const url = n ? `https://doaj.org/api/search/journals/issn:${n}` : "https://doaj.org/api/search/journals/";
  if (!n) return { evidence: [] };
  if (DISABLED()) return { evidence: [unavailable("DOAJ API", "metadata.doaj", "METADATA", url, "pencarian eksternal dinonaktifkan")] };
  try {
    const r = await safeFetch(url, { timeoutMs: 8000, maxBytes: 400_000, allowPrivate: false });
    if (!r.ok) return { evidence: [unavailable("DOAJ API", "metadata.doaj", "METADATA", url, httpFailure(r.status, r.retryAfter), "ERROR")] };
    let j: any;
    try { j = JSON.parse(r.text); } catch { return { evidence: [unavailable("DOAJ API", "metadata.doaj", "METADATA", url, "respons bukan JSON yang valid", "ERROR")] }; }
    if (!j || !Array.isArray(j.results)) return { evidence: [unavailable("DOAJ API", "metadata.doaj", "METADATA", url, "bentuk respons tidak dikenali", "ERROR")] };
    const hit = j?.results?.[0];
    const now = new Date().toISOString();
    if (!hit) {
      return {
        info: { found: false, issns: [] },
        evidence: [makeEvidence({
          check: "METADATA", key: "metadata.doaj", finding: `ISSN ${n} tidak ditemukan di DOAJ.`, status: "NOT_FOUND", integration: "LIVE_VERIFIED",
          sourceName: "DOAJ API", sourceUrl: url, retrievedAt: now, sourceDataDate: now,
          explanation: "Ketiadaan di DOAJ bukan bukti penipuan; DOAJ hanya mendaftar jurnal akses terbuka yang mengajukan diri.",
          severity: claimsDoaj ? "MEDIUM" : "INFO", strength: "MODERATE", fingerprintSeed: `doaj-nf|${n}`,
        })],
      };
    }
    const b = hit.bibjson ?? {};
    const issns = [b.pissn, b.eissn].map((x: string) => normalizeIssn(x)).filter(Boolean) as string[];
    const homepage: string | undefined = b.ref?.journal;
    const info = { found: true, title: b.title, publisher: b.publisher?.name, homepage, issns, apc: b.apc?.has_apc ?? null, seal: hit.admin?.seal ?? null };
    const ev: EvidenceRecord[] = [makeEvidence({
      check: "METADATA", key: "metadata.doaj", finding: `Terdaftar di DOAJ: "${b.title}" (${b.publisher?.name ?? "penerbit tidak dicantumkan"}).`, status: "VERIFIED", integration: "LIVE_VERIFIED",
      sourceName: "DOAJ API", sourceUrl: url, retrievedAt: now, sourceDataDate: hit.last_updated ?? now,
      extracted: JSON.stringify({ title: b.title, publisher: b.publisher?.name, issns, homepage, seal: info.seal }),
      explanation: "Partisipasi DOAJ bersifat pendukung, bukan jaminan universal kualitas.", severity: "INFO", strength: "MODERATE",
      data: info, fingerprintSeed: `doaj|${n}|${hit.id}`,
    })];
    if (homepage) {
      ev.push(makeEvidence({
        check: "IDENTITY", key: "identity.official_domain", finding: `Beranda jurnal menurut DOAJ: ${homepage}`, status: "VERIFIED", integration: "LIVE_VERIFIED",
        sourceName: "DOAJ API", sourceUrl: url, retrievedAt: now, sourceDataDate: hit.last_updated ?? now,
        extracted: homepage, explanation: "Beranda yang dilaporkan penerbit kepada DOAJ digunakan sebagai pembanding domain resmi.",
        severity: "INFO", strength: "MODERATE", data: { domains: [homepage], via: "DOAJ" }, fingerprintSeed: `doaj-home|${n}|${homepage}`,
      }));
    }
    return { evidence: ev, info };
  } catch (e: any) {
    return { evidence: [unavailable("DOAJ API", "metadata.doaj", "METADATA", url, e?.name === "AbortError" ? "waktu habis" : String(e?.cause?.code ?? e?.cause?.message ?? e?.message ?? e).slice(0, 100), "ERROR")] };
  }
}

export async function lookupCrossref(issn: string | null, title: string): Promise<{ evidence: EvidenceRecord[]; info?: ExternalJournalInfo["crossref"] }> {
  const n = normalizeIssn(issn);
  if (!n) return { evidence: [] };
  const url = `https://api.crossref.org/journals/${n}`;
  if (DISABLED()) return { evidence: [unavailable("Crossref REST API", "metadata.crossref", "METADATA", url, "pencarian eksternal dinonaktifkan")] };
  try {
    const r = await safeFetch(url, { timeoutMs: 8000, maxBytes: 300_000, headers: { accept: "application/json" } });
    if (r.status === 404) {
      return { info: { found: false, issns: [] }, evidence: [makeEvidence({
        check: "METADATA", key: "metadata.crossref", finding: `ISSN ${n} tidak ditemukan di Crossref.`, status: "NOT_FOUND", integration: "LIVE_VERIFIED", sourceName: "Crossref REST API", sourceUrl: url,
        explanation: "Tidak adanya registrasi DOI Crossref bukan bukti penipuan; tidak semua penerbit memakai Crossref.", severity: "INFO", strength: "WEAK", fingerprintSeed: `cr-nf|${n}`,
      })] };
    }
    if (!r.ok) return { evidence: [unavailable("Crossref REST API", "metadata.crossref", "METADATA", url, httpFailure(r.status, r.retryAfter), "ERROR")] };
    let m: any;
    try { m = JSON.parse(r.text)?.message; } catch { return { evidence: [unavailable("Crossref REST API", "metadata.crossref", "METADATA", url, "respons bukan JSON yang valid", "ERROR")] }; }
    if (!m || typeof m !== "object") return { evidence: [unavailable("Crossref REST API", "metadata.crossref", "METADATA", url, "bentuk respons tidak dikenali", "ERROR")] };
    const issns = (m?.ISSN ?? []).map((x: string) => normalizeIssn(x)).filter(Boolean) as string[];
    const info = { found: true, title: m?.title, publisher: m?.publisher, issns, totalDois: m?.counts?.["total-dois"], currentDois: m?.counts?.["current-dois"], backfileDois: m?.counts?.["backfile-dois"] };
    const sim = m?.title ? titleSimilarity(m.title, title) : 0;
    const ev: EvidenceRecord[] = [makeEvidence({
      check: "METADATA", key: "metadata.crossref", finding: `Crossref: "${m?.title}" — ${m?.publisher ?? "?"}; ${info.totalDois ?? "?"} DOI terdaftar.`, status: "VERIFIED", integration: "LIVE_VERIFIED",
      sourceName: "Crossref REST API", sourceUrl: url, extracted: JSON.stringify(info),
      explanation: "Registrasi DOI membuktikan aktivitas penerbitan, BUKAN kualitas jurnal.", severity: "INFO", strength: "MODERATE", data: info, fingerprintSeed: `cr|${n}|${m?.title}`,
    })];
    if (m?.title && sim < 0.5) {
      ev.push(makeEvidence({
        check: "IDENTITY", key: "identity.title_mismatch", finding: `Judul pada Crossref ("${m.title}") berbeda dari judul yang diajukan ("${title}") untuk ISSN ${n}.`, status: "CONFLICTED", integration: "LIVE_VERIFIED",
        sourceName: "Crossref REST API", sourceUrl: url, severity: "MEDIUM", requiresHumanConfirmation: true, strength: "MODERATE",
        explanation: "Dapat berupa perubahan judul sah atau penggunaan ISSN oleh pihak lain; perlu peninjauan manusia.", data: { crossrefTitle: m.title, submittedTitle: title }, fingerprintSeed: `cr-title|${n}|${m.title}|${title}`,
      }));
    }
    return { evidence: ev, info };
  } catch (e: any) {
    return { evidence: [unavailable("Crossref REST API", "metadata.crossref", "METADATA", url, e?.name === "AbortError" ? "waktu habis" : String(e?.cause?.code ?? e?.cause?.message ?? e?.message ?? e).slice(0, 100), "ERROR")] };
  }
}
