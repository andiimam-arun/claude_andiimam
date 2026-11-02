import { isValidIssn, normalizeIssn } from "./issn";
import { extractHostname, registrableDomain } from "./domain";

export interface ExtractedFields {
  manuscriptId?: string;
  title?: string;
  journalName?: string;
  issns: string[];
  dois: string[];
  emails: string[];
  domains: string[];
  urls: string[];
  dates: string[];
  amounts: string[];
  bankAccounts: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, maret: 3, apr: 4, april: 4,
  may: 5, mei: 5, jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8, agu: 8, agustus: 8, ags: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12, des: 12, desember: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Ekstraksi heuristik berbasis pola. Hasil WAJIB ditinjau & dikoreksi manusia; tidak pernah dianggap bukti otentik. */
export function extractFields(text: string): ExtractedFields {
  const t = text.replace(/\r/g, "");
  const out: ExtractedFields = { issns: [], dois: [], emails: [], domains: [], urls: [], dates: [], amounts: [], bankAccounts: [] };

  const issnRe = /\b(\d{4})-?(\d{3}[\dXx])\b/g;
  for (const m of t.matchAll(issnRe)) {
    const cand = `${m[1]}-${m[2].toUpperCase()}`;
    if (isValidIssn(cand) && /issn|e-?issn|p-?issn/i.test(t.slice(Math.max(0, m.index! - 24), m.index!))) out.issns.push(cand);
  }
  out.dois = Array.from(new Set((t.match(/\b10\.\d{4,9}\/[^\s"<>]+/g) ?? []).map((d) => d.replace(/[.,;)]+$/, ""))));
  out.emails = Array.from(new Set((t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((e) => e.toLowerCase())));
  out.urls = Array.from(new Set((t.match(/https?:\/\/[^\s"<>)]+/gi) ?? []).map((u) => u.replace(/[.,;]+$/, ""))));
  const doms = [...out.emails.map((e) => e.split("@")[1]), ...out.urls.map((u) => extractHostname(u) ?? "")].map((d) => registrableDomain(d)).filter(Boolean) as string[];
  out.domains = Array.from(new Set(doms));

  const mid = t.match(/(?:manuscript|submission|paper|article|tracking)\s*(?:id|no\.?|number|#|ID)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-_/.]{2,})/i)
    ?? t.match(/(?:ID\s*(?:naskah|manuskrip)|nomor\s*(?:naskah|manuskrip))\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-_/.]{2,})/i);
  if (mid) out.manuscriptId = mid[1].replace(/[.,;]+$/, "");

  const title = t.match(/(?:^|\n)\s*(?:manuscript\s+title|title\s+of\s+(?:the\s+)?(?:manuscript|paper|article)|judul(?:\s+naskah)?|title)\s*[:\-]\s*["“]?(.{8,300}?)["”]?\s*(?:\n|$)/i);
  if (title) out.title = title[1].trim();
  const jn = t.match(/(?:^|\n)\s*(?:journal(?:\s+name)?|nama\s+jurnal)\s*[:\-]\s*(.{4,200}?)\s*(?:\n|$)/i);
  if (jn) out.journalName = jn[1].trim();

  const dates = new Set<string>();
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) dates.add(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of t.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) dates.add(`${m[3]}-${pad(mo)}-${pad(Number(m[1]))}`);
  }
  for (const m of t.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) dates.add(`${m[3]}-${pad(mo)}-${pad(Number(m[2]))}`);
  }
  out.dates = Array.from(dates).sort();

  out.amounts = Array.from(new Set((t.match(/(?:USD|US\$|EUR|IDR|Rp\.?|\$|€)\s?[\d][\d.,]*/g) ?? []).map((a) => a.trim())));
  out.bankAccounts = Array.from(new Set((t.match(/(?:account|rekening|IBAN|SWIFT|acc\.?\s*no)[^\n:]{0,20}[:\s]\s*([A-Z0-9][A-Z0-9 \-]{6,32})/gi) ?? []).map((a) => a.replace(/\s+/g, " ").trim())));
  out.issns = Array.from(new Set(out.issns.map((x) => normalizeIssn(x)!)));
  return out;
}

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
}

export function titleSimilarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter++; });
  return inter / Math.max(A.size, B.size);
}
