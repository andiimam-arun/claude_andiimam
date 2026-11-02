import { isValidIssn } from "./issn";
import { titleSimilarity } from "./extract";
import { normalizeTitle } from "./util";

/**
 * Parser/penggabung MURNI untuk workbook Scopus Source List (tiga sheet: Sources, Discontinued Titles, Accepted Titles).
 * Header dideteksi dari NAMA KOLOM (bukan nomor baris tetap) sehingga pembaruan berikutnya tetap didukung.
 * Identifier diperlakukan sebagai TEKS: nol di depan dan huruf X dipertahankan.
 */

export type SheetRole = "SOURCES" | "DISCONTINUED" | "ACCEPTED";
export type Field =
  | "sourceId" | "title" | "issn" | "eissn" | "active" | "discQuality" | "coverage" | "sourceType" | "publisher" | "publisherGroup" | "country"
  | "asjc" | "openAccess" | "indexationChange" | "finalYear" | "finalVolume" | "finalIssue" | "finalPages";

export const hn = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const EXACT: Partial<Record<Field, string[]>> = {
  sourceId: ["sourcerecordid", "sourceid", "scopussourceid", "sourcerecord", "scopusid", "sourcerecordidscopus"],
  title: ["sourcetitle", "title", "serialtitle", "journaltitle", "sourcename", "journalname"],
  issn: ["printissn", "issn", "pissn", "printedissn", "issnprint"],
  eissn: ["eissn", "onlineissn", "electronicissn", "issne", "issnonline"],
  active: ["activeorinactive", "activeinactive", "status", "scopusstatus", "coveragestatus"],
  coverage: ["coverage", "scopuscoverageyears", "coverageyears", "coverageperiod"],
  sourceType: ["sourcetype", "type"],
  publisher: ["publishersname", "publisher", "publishername"],
};

/** Memetakan satu nama kolom ke field baku; null bila tidak dikenal (kolom tetap disimpan sebagai data tambahan). */
export function mapHeader(raw: string): Field | null {
  const h = hn(raw);
  if (!h) return null;
  if (h.includes("indexation") || h.includes("indexingchange")) return "indexationChange";
  if (h.includes("final") && h.includes("year")) return "finalYear";
  if (h.includes("final") && h.includes("volume")) return "finalVolume";
  if (h.includes("final") && h.includes("issue")) return "finalIssue";
  if (h.includes("final") && h.includes("page")) return "finalPages";
  if (h.includes("discontinued") && h.includes("scopus")) return "discQuality";
  if (h.includes("asjc") || h.includes("scienceclassification")) return "asjc";
  if (h.includes("openaccess")) return "openAccess";
  if (h.includes("publisher") && h.includes("country")) return "country";
  if (h.includes("publisher") && (h.includes("group") || h.includes("imprint") || h.includes("main"))) return "publisherGroup";
  for (const [f, list] of Object.entries(EXACT) as Array<[Field, string[]]>) if (list.includes(h)) return f;
  if (h.startsWith("coverage") && !h.includes("final")) return "coverage";
  return null;
}

export interface HeaderDetection { rowIndex: number; mapping: Partial<Record<Field, number>>; headers: string[]; score: number }

/** Mencari baris header pada ~25 baris pertama berdasarkan jumlah nama kolom yang dikenali. */
export function detectHeaderRow(rows: string[][]): HeaderDetection | null {
  let best: HeaderDetection | null = null;
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const mapping: Partial<Record<Field, number>> = {};
    rows[i].forEach((c, col) => { const f = c ? mapHeader(c) : null; if (f && mapping[f] === undefined) mapping[f] = col; });
    const score = Object.keys(mapping).length;
    if (mapping.title !== undefined && score >= 2 && (!best || score > best.score)) best = { rowIndex: i, mapping, headers: rows[i], score };
  }
  return best;
}

export function detectSheetRole(sheetName: string, mapping: Partial<Record<Field, number>>): SheetRole | null {
  const n = sheetName.toLowerCase();
  if (n.includes("discontinued")) return "DISCONTINUED";
  if (n.includes("accepted")) return "ACCEPTED";
  if (n.includes("sources") || n.includes("source list")) return "SOURCES";
  if (mapping.indexationChange !== undefined || mapping.finalYear !== undefined) return "DISCONTINUED";
  if (mapping.active !== undefined) return "SOURCES";
  return null;
}

// ---------- identifier ----------
export function normalizeId(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\.0+$/, "");
  return s ? s : null;
}

export interface IssnResult { key: string | null; display: string | null; warning?: "ZERO_PADDED" | "INVALID" }

/** ISSN → kunci 8 karakter (tanpa tanda hubung, huruf besar). Nol di depan hilang pada sel numerik hanya dipulihkan bila digit pemeriksa sah. */
export function issnKey(raw: string | null | undefined): IssnResult {
  if (raw == null) return { key: null, display: null };
  const c = String(raw).toUpperCase().replace(/[^0-9X]/g, "");
  if (!c) return { key: null, display: null };
  const fmt = (k: string) => `${k.slice(0, 4)}-${k.slice(4)}`;
  if (c.length === 8) return isValidIssn(fmt(c)) ? { key: c, display: fmt(c) } : { key: null, display: null, warning: "INVALID" };
  if (c.length < 8 && /^\d+$/.test(c)) {
    const p = c.padStart(8, "0");
    return isValidIssn(fmt(p)) ? { key: p, display: fmt(p), warning: "ZERO_PADDED" } : { key: null, display: null, warning: "INVALID" };
  }
  return { key: null, display: null, warning: "INVALID" };
}

export function parseCoverage(raw: string | null | undefined): { from: number | null; to: number | null } {
  if (!raw) return { from: null, to: null };
  const ys = (String(raw).match(/(?:19|20)\d{2}/g) ?? []).map(Number);
  if (!ys.length) return { from: null, to: null };
  return { from: Math.min(...ys), to: Math.max(...ys) };
}

export type QueryKind = "ISSN" | "SOURCE_ID" | "TITLE";
/** Klasifikasi kueri pencarian: ISSN dengan/ tanpa tanda hubung, Source ID, atau judul. */
export function classifyQuery(q: string): { kind: QueryKind; value: string } {
  const t = q.trim();
  if (/^\d{4}-?\d{3}[\dXx]$/.test(t)) return { kind: "ISSN", value: t.replace("-", "").toUpperCase() };
  if (/^\d{9,13}$/.test(t)) return { kind: "SOURCE_ID", value: t };
  return { kind: "TITLE", value: normalizeTitle(t) };
}

// ---------- penggabungan ----------
export interface ParsedSheet {
  name: string;
  role: SheetRole;
  headerRow: number; // 1-based
  headers: string[];
  mapping: Partial<Record<Field, number>>;
  rows: Array<{ rowNumber: number; cells: string[] }>;
}

export interface Conflict { type: string; detail: string; sheet?: string; row?: number }
export interface DiscontinuedInfo { indexationChange: string | null; finalYear: number | null; finalYearRaw: string | null; finalVolume: string | null; finalIssue: string | null; finalPages: string | null; extra: Record<string, string>; row: number }
export interface AcceptedInfo { extra: Record<string, string>; row: number }

export interface MergedRecord {
  sourceId: string | null; title: string; normTitle: string; issnRaw: string | null; eissnRaw: string | null; issn: string | null; eissn: string | null;
  status: "ACTIVE" | "INACTIVE" | "ACCEPTED" | "UNKNOWN"; activeRaw: string | null; coverage: string | null; coverageFrom: number | null; coverageTo: number | null;
  discontinuedQuality: boolean; discontinuedRaw: string | null; sourceType: string | null; publisher: string | null; publisherGroup: string | null; publisherCountry: string | null;
  asjc: string | null; openAccessRaw: string | null; origin: SheetRole; discontinued: DiscontinuedInfo | null; accepted: AcceptedInfo | null; conflicts: Conflict[]; extra: Record<string, string>;
}

export interface MergeSummary {
  sheets: Array<{ name: string; role: SheetRole; headerRow: number; rowsRead: number; validRows: number; errorRows: number; mapping: Record<string, string>; unmappedHeaders: string[] }>;
  ignoredSheets: Array<{ name: string; reason: string }>;
  totals: { records: number; sources: number; discontinuedRows: number; discontinuedMatched: number; discontinuedStandalone: number; acceptedRows: number; acceptedStandalone: number; duplicates: number; conflicts: number; errors: number; warnings: number };
  statusCounts: Record<string, number>;
  qualityFlagValues: Record<string, number>;
  conflictsByType: Record<string, number>;
  conflictSamples: Array<Conflict & { sourceId: string | null; title: string }>;
  errorSamples: Array<{ sheet: string; row: number; message: string }>;
  warningCounts: Record<string, number>;
  duplicateSamples: Array<{ sourceId: string; rows: number[] }>;
}

const cell = (cells: string[], mapping: Partial<Record<Field, number>>, f: Field): string | null => {
  const i = mapping[f];
  if (i === undefined) return null;
  const v = (cells[i] ?? "").trim();
  return v === "" ? null : v;
};

function extraOf(cells: string[], headers: string[], mapping: Partial<Record<Field, number>>): Record<string, string> {
  const used = new Set(Object.values(mapping));
  const out: Record<string, string> = {};
  headers.forEach((h, i) => { if (!used.has(i) && h && (cells[i] ?? "").trim() !== "") out[h] = cells[i].trim(); });
  return out;
}

const isTruthyFlag = (raw: string | null) => !!raw && !/^(no|n|false|0|-|none|n\/a|na)$/i.test(raw.trim());

export function mergeScopus(sheets: ParsedSheet[], ignoredSheets: MergeSummary["ignoredSheets"] = []): { records: MergedRecord[]; summary: MergeSummary } {
  const summary: MergeSummary = {
    sheets: [], ignoredSheets, totals: { records: 0, sources: 0, discontinuedRows: 0, discontinuedMatched: 0, discontinuedStandalone: 0, acceptedRows: 0, acceptedStandalone: 0, duplicates: 0, conflicts: 0, errors: 0, warnings: 0 },
    statusCounts: {}, qualityFlagValues: {}, conflictsByType: {}, conflictSamples: [], errorSamples: [], warningCounts: {}, duplicateSamples: [],
  };
  const warn = (k: string) => { summary.warningCounts[k] = (summary.warningCounts[k] ?? 0) + 1; summary.totals.warnings++; };
  const err = (sheet: string, row: number, message: string) => { summary.totals.errors++; if (summary.errorSamples.length < 50) summary.errorSamples.push({ sheet, row, message }); };

  const base = (s: ParsedSheet, r: { rowNumber: number; cells: string[] }): MergedRecord | null => {
    const title = cell(r.cells, s.mapping, "title");
    if (!title) { err(s.name, r.rowNumber, "Judul kosong"); return null; }
    const i1 = issnKey(cell(r.cells, s.mapping, "issn")), i2 = issnKey(cell(r.cells, s.mapping, "eissn"));
    for (const x of [i1, i2]) if (x.warning === "INVALID") warn("ISSN_TIDAK_VALID"); else if (x.warning === "ZERO_PADDED") warn("ISSN_NOL_DIPULIHKAN");
    const activeRaw = cell(r.cells, s.mapping, "active");
    const status: MergedRecord["status"] = s.role === "ACCEPTED" ? "ACCEPTED" : !activeRaw ? (s.role === "DISCONTINUED" ? "INACTIVE" : "UNKNOWN") : /^inactive/i.test(activeRaw) ? "INACTIVE" : /^active/i.test(activeRaw) ? "ACTIVE" : "UNKNOWN";
    const cov = cell(r.cells, s.mapping, "coverage");
    const { from, to } = parseCoverage(cov);
    const dq = cell(r.cells, s.mapping, "discQuality");
    if (dq) summary.qualityFlagValues[dq] = (summary.qualityFlagValues[dq] ?? 0) + 1;
    return {
      sourceId: normalizeId(cell(r.cells, s.mapping, "sourceId")), title, normTitle: normalizeTitle(title),
      issnRaw: cell(r.cells, s.mapping, "issn"), eissnRaw: cell(r.cells, s.mapping, "eissn"), issn: i1.key, eissn: i2.key,
      status, activeRaw, coverage: cov, coverageFrom: from, coverageTo: to, discontinuedQuality: isTruthyFlag(dq), discontinuedRaw: dq,
      sourceType: cell(r.cells, s.mapping, "sourceType"), publisher: cell(r.cells, s.mapping, "publisher"), publisherGroup: cell(r.cells, s.mapping, "publisherGroup"),
      publisherCountry: cell(r.cells, s.mapping, "country"), asjc: cell(r.cells, s.mapping, "asjc"), openAccessRaw: cell(r.cells, s.mapping, "openAccess"),
      origin: s.role, discontinued: null, accepted: null, conflicts: [], extra: extraOf(r.cells, s.headers, s.mapping),
    };
  };

  const records: MergedRecord[] = [];
  const bySourceId = new Map<string, MergedRecord>();
  const byIssn = new Map<string, MergedRecord[]>();
  const index = (rec: MergedRecord) => {
    if (rec.sourceId && !bySourceId.has(rec.sourceId)) bySourceId.set(rec.sourceId, rec);
    for (const k of new Set([rec.issn, rec.eissn].filter(Boolean) as string[])) byIssn.set(k, [...(byIssn.get(k) ?? []), rec]);
  };
  const addConflict = (rec: MergedRecord, c: Conflict) => {
    rec.conflicts.push(c);
    summary.conflictsByType[c.type] = (summary.conflictsByType[c.type] ?? 0) + 1;
    summary.totals.conflicts++;
    if (summary.conflictSamples.length < 60) summary.conflictSamples.push({ ...c, sourceId: rec.sourceId, title: rec.title });
  };
  const sheetStat = (s: ParsedSheet) => {
    const st = { name: s.name, role: s.role, headerRow: s.headerRow, rowsRead: s.rows.length, validRows: 0, errorRows: 0, mapping: Object.fromEntries(Object.entries(s.mapping).map(([f, i]) => [f, s.headers[i as number]])) as Record<string, string>, unmappedHeaders: s.headers.filter((h, i) => h && !Object.values(s.mapping).includes(i)) };
    summary.sheets.push(st);
    return st;
  };

  // 1. Sources
  const dupRows = new Map<string, number[]>();
  for (const s of sheets.filter((x) => x.role === "SOURCES")) {
    const st = sheetStat(s);
    for (const r of s.rows) {
      const rec = base(s, r);
      if (!rec) { st.errorRows++; continue; }
      st.validRows++;
      if (rec.sourceId && bySourceId.has(rec.sourceId)) {
        const first = bySourceId.get(rec.sourceId)!;
        const prev = dupRows.get(rec.sourceId) ?? [Number(first.extra.__row ?? 0)];
        dupRows.set(rec.sourceId, [...prev, r.rowNumber]);
        summary.totals.duplicates++;
        if (first.status !== rec.status || first.coverage !== rec.coverage) addConflict(first, { type: "DUPLICATE_SOURCE_ID_DIFFERENT", detail: `Source ID ${rec.sourceId} muncul lagi dengan status/coverage berbeda (baris ${r.rowNumber}).`, sheet: s.name, row: r.rowNumber });
        continue;
      }
      rec.extra.__row = String(r.rowNumber);
      records.push(rec); index(rec);
      summary.totals.sources++;
    }
  }
  for (const [sid, rows] of dupRows) if (summary.duplicateSamples.length < 30) summary.duplicateSamples.push({ sourceId: sid, rows });
  for (const rec of records) delete rec.extra.__row;

  // ISSN yang sama dipakai Source ID berbeda (indikasi data bermasalah) — dicatat sebagai konflik pada record kedua
  for (const [k, list] of byIssn) {
    const ids = new Set(list.map((x) => x.sourceId ?? "?"));
    if (ids.size > 1) for (const rec of list.slice(1)) addConflict(rec, { type: "ISSN_SHARED_BY_OTHER_SOURCE", detail: `ISSN ${k} juga dipakai Source ID ${list[0].sourceId ?? "?"}.` });
  }

  const match = (rec: MergedRecord): { target: MergedRecord | null; ambiguous: boolean; mismatch: string | null } => {
    if (rec.sourceId && bySourceId.has(rec.sourceId)) return { target: bySourceId.get(rec.sourceId)!, ambiguous: false, mismatch: null };
    const cands = new Set<MergedRecord>();
    for (const k of [rec.issn, rec.eissn].filter(Boolean) as string[]) for (const x of byIssn.get(k) ?? []) cands.add(x);
    if (cands.size === 0) return { target: null, ambiguous: false, mismatch: null };
    if (cands.size > 1) return { target: null, ambiguous: true, mismatch: null };
    const t = [...cands][0];
    if (rec.sourceId && t.sourceId && rec.sourceId !== t.sourceId) return { target: null, ambiguous: false, mismatch: `ISSN cocok dengan Source ID ${t.sourceId}, tetapi baris membawa Source ID ${rec.sourceId}.` };
    return { target: t, ambiguous: false, mismatch: null };
  };

  // 2. Discontinued
  for (const s of sheets.filter((x) => x.role === "DISCONTINUED")) {
    const st = sheetStat(s);
    for (const r of s.rows) {
      summary.totals.discontinuedRows++;
      const rec = base(s, r);
      if (!rec) { st.errorRows++; continue; }
      st.validRows++;
      const fy = cell(r.cells, s.mapping, "finalYear");
      const info: DiscontinuedInfo = {
        indexationChange: cell(r.cells, s.mapping, "indexationChange"), finalYear: parseCoverage(fy).to, finalYearRaw: fy, finalVolume: cell(r.cells, s.mapping, "finalVolume"),
        finalIssue: cell(r.cells, s.mapping, "finalIssue"), finalPages: cell(r.cells, s.mapping, "finalPages"), extra: rec.extra, row: r.rowNumber,
      };
      const m = match(rec);
      if (m.target) {
        const t = m.target;
        t.discontinued = info;
        summary.totals.discontinuedMatched++;
        if (t.status === "ACTIVE") addConflict(t, { type: "ACTIVE_BUT_DISCONTINUED", detail: `Sheet Sources menyatakan Active, tetapi judul ini tercantum pada sheet Discontinued (baris ${r.rowNumber}).`, sheet: s.name, row: r.rowNumber });
        if (titleSimilarity(t.title, rec.title) < 0.5) addConflict(t, { type: "TITLE_MISMATCH_DISCONTINUED", detail: `Judul pada sheet Discontinued ("${rec.title}") berbeda dari sheet Sources ("${t.title}").`, sheet: s.name, row: r.rowNumber });
        if (rec.discontinuedQuality && !t.discontinuedQuality) { t.discontinuedQuality = true; t.discontinuedRaw = rec.discontinuedRaw; }
        continue;
      }
      // tidak terhubung: record mandiri berasal dari sheet Discontinued
      rec.discontinued = info; rec.status = "INACTIVE"; rec.extra = {};
      if (m.ambiguous) addConflict(rec, { type: "AMBIGUOUS_MATCH", detail: "ISSN pada sheet Discontinued cocok dengan lebih dari satu record Sources; tidak digabung otomatis.", sheet: s.name, row: r.rowNumber });
      if (m.mismatch) addConflict(rec, { type: "SOURCE_ID_MISMATCH", detail: m.mismatch, sheet: s.name, row: r.rowNumber });
      summary.totals.discontinuedStandalone++;
      records.push(rec); index(rec);
    }
  }

  // 3. Accepted
  for (const s of sheets.filter((x) => x.role === "ACCEPTED")) {
    const st = sheetStat(s);
    for (const r of s.rows) {
      summary.totals.acceptedRows++;
      const rec = base(s, r);
      if (!rec) { st.errorRows++; continue; }
      st.validRows++;
      const m = match(rec);
      if (m.target) {
        m.target.accepted = { extra: rec.extra, row: r.rowNumber };
        addConflict(m.target, { type: "ACCEPTED_BUT_LISTED", detail: `Judul tercantum pada sheet Accepted (baris ${r.rowNumber}) padahal sudah ada pada Sources dengan status ${m.target.status}.`, sheet: s.name, row: r.rowNumber });
        continue;
      }
      rec.accepted = { extra: { ...rec.extra }, row: r.rowNumber };
      if (!rec.sourceId && !rec.issn && !rec.eissn) warn("ACCEPTED_TANPA_IDENTIFIER");
      if (m.mismatch) addConflict(rec, { type: "SOURCE_ID_MISMATCH", detail: m.mismatch, sheet: s.name, row: r.rowNumber });
      summary.totals.acceptedStandalone++;
      records.push(rec); index(rec);
    }
  }

  summary.totals.records = records.length;
  for (const r of records) summary.statusCounts[r.status] = (summary.statusCounts[r.status] ?? 0) + 1;
  return { records, summary };
}
