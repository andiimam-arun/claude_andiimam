import Papa from "papaparse";
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { isValidIssn, normalizeIssn } from "../engine/issn";
import { registrableDomain } from "../engine/domain";
import { normalizeTitle } from "../engine/util";
import { audit, type Actor } from "./audit";
import { isPilot } from "../mode";

export type DatasetKind = "SCOPUS_SOURCE_LIST" | "SCIMAGO" | "BEALL" | "HIJACKED" | "DOAJ_LIST";
export const DATASET_KINDS: DatasetKind[] = ["SCOPUS_SOURCE_LIST", "SCIMAGO", "BEALL", "HIJACKED", "DOAJ_LIST"];

const ALIASES: Record<string, string[]> = {
  title: ["sourcetitle", "title", "journaltitle", "journalname", "journal", "name", "judul", "namajurnal"],
  issn: ["issn", "printissn", "pissn", "issnprint", "issnp"],
  eissn: ["eissn", "eissn", "onlineissn", "issnonline", "issne"],
  sourceId: ["sourceid", "scopussourceid", "scopusid", "sourcerecordid"],
  publisher: ["publishersname", "publisher", "publishername", "penerbit"],
  status: ["activeorinactive", "status", "coveragestatus", "activeinactive"],
  quartile: ["sjrbestquartile", "bestquartile", "quartile", "kuartil"],
  sjr: ["sjr"],
  categories: ["categories", "subjectareas", "subjectarea", "subject", "areas"],
  country: ["publishercountry", "country", "negara"],
  url: ["url", "website", "homepage", "journalurl", "authenticurl", "officialurl"],
  hijackedUrl: ["hijackedurl", "fakeurl", "cloneurl", "clonedurl", "hijackedwebsite", "fakewebsite", "hijackedsite"],
  discontinuedQuality: ["titlesdiscontinuedbyscopusduetoqualityissues", "discontinuedduetoquality", "discontinuedforquality"],
  coverage: ["coverage", "scopuscoverageyears", "coverageyears"],
  year: ["year", "tahun", "reportyear"],
  note: ["note", "notes", "catatan", "reason"],
};

const hn = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function pick(row: Record<string, string>, field: keyof typeof ALIASES): string {
  for (const a of ALIASES[field]) {
    for (const [k, v] of Object.entries(row)) if (hn(k) === a && v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** ISSN pada ekspor sering kehilangan nol di depan; dipulihkan HANYA bila checksum sah. */
function fixIssn(raw: string): string | null {
  const direct = normalizeIssn(raw);
  const d = raw.replace(/[^0-9Xx]/g, "");
  if (direct) return isValidIssn(direct) ? direct : null; // digit pemeriksa wajib sah
  if (d.length === 7) { const p = normalizeIssn("0" + d); return p && isValidIssn(p) ? p : null; }
  return null;
}

async function parseRows(buf: Buffer, filename: string): Promise<Record<string, string>[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (headers[i - 1] = String(c.value ?? "")));
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const o: Record<string, string> = {};
      headers.forEach((h, i) => {
        const v = row.getCell(i + 1).value;
        o[h] = v == null ? "" : typeof v === "object" && "text" in (v as any) ? String((v as any).text) : String(v);
      });
      rows.push(o);
    });
    return rows;
  }
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    return res.data;
  }
  throw new Error("Format harus CSV atau XLSX");
}

export interface ImportInput {
  kind: DatasetKind;
  buffer: Buffer;
  filename: string;
  versionLabel: string;
  provenance: string; // asal & dasar legal perolehan data
  sourceDate?: Date | null;
  isComplete: boolean; // apakah daftar lengkap dari sumber resmi
  isDemo?: boolean;
  actor: Actor;
}

export interface ImportValidation {
  rowCount: number; columns: Record<string, string | null>; rowsWithoutIdentifier: number; invalidIssnRows: number; duplicateIdentifierRows: number;
  statusValues: Record<string, number>; warnings: string[]; errors: string[];
}

/** Validasi struktur berkas impor SEBELUM menyimpan. Galat menolak impor; peringatan dicatat pada dataset. */
export function validateImport(kind: DatasetKind, rows: Record<string, string>[], opts: { sourceDate?: Date | null }): ImportValidation {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const col = (f: keyof typeof ALIASES) => headers.find((h) => ALIASES[f].includes(hn(h))) ?? null;
  const columns: Record<string, string | null> = Object.fromEntries((["title", "issn", "eissn", "sourceId", "publisher", "status", "quartile", "url", "hijackedUrl"] as const).map((f) => [f, col(f)]));
  const v: ImportValidation = { rowCount: rows.length, columns, rowsWithoutIdentifier: 0, invalidIssnRows: 0, duplicateIdentifierRows: 0, statusValues: {}, warnings: [], errors: [] };
  if (!rows.length) { v.errors.push("Berkas tidak memuat baris data."); return v; }
  if (!columns.title) v.errors.push("Kolom judul tidak ditemukan (mis. 'Source Title', 'Title').");
  if (kind === "SCOPUS_SOURCE_LIST") {
    if (!columns.issn && !columns.eissn && !columns.sourceId) v.errors.push("Tidak ada kolom identifier (Print-ISSN / E-ISSN / Sourceid). Pencocokan berbasis judul saja tidak diterima untuk Scopus.");
    if (!columns.status) v.errors.push("Kolom status ('Active or Inactive') tidak ditemukan; status cakupan tidak dapat ditentukan.");
    if (!opts.sourceDate) v.errors.push("Tanggal pengamatan data sumber wajib diisi untuk impor Scopus.");
    else if (opts.sourceDate.getTime() > Date.now() + 86_400_000) v.errors.push("Tanggal pengamatan tidak boleh di masa depan.");
  }
  const seen = new Set<string>();
  for (const r of rows) {
    const issn = pick(r, "issn"), eissn = pick(r, "eissn"), sid = pick(r, "sourceId");
    if (!issn && !eissn && !sid) v.rowsWithoutIdentifier++;
    for (const raw of [issn, eissn]) if (raw && !fixIssn(raw)) v.invalidIssnRows++;
    for (const id of [fixIssn(issn), fixIssn(eissn), sid || null]) if (id) { if (seen.has(id)) v.duplicateIdentifierRows++; seen.add(id); }
    const st = pick(r, "status").toLowerCase(); if (st) v.statusValues[st] = (v.statusValues[st] ?? 0) + 1;
  }
  if (kind === "SCOPUS_SOURCE_LIST") {
    const unknown = Object.keys(v.statusValues).filter((k) => !k.startsWith("active") && !k.startsWith("inactive") && !k.includes("discontinued"));
    if (unknown.length) v.warnings.push(`Nilai status tidak dikenal (diperlakukan tidak terverifikasi): ${unknown.join(", ")}`);
    if (v.invalidIssnRows / rows.length > 0.05) v.errors.push(`Terlalu banyak ISSN tidak valid (${v.invalidIssnRows} baris; > 5%). Periksa format/encoding berkas.`);
    else if (v.invalidIssnRows) v.warnings.push(`${v.invalidIssnRows} nilai ISSN tidak valid dilewati.`);
    if (v.rowsWithoutIdentifier) v.warnings.push(`${v.rowsWithoutIdentifier} baris tanpa identifier.`);
  }
  if (v.duplicateIdentifierRows) v.warnings.push(`${v.duplicateIdentifierRows} identifier muncul lebih dari sekali.`);
  return v;
}

export async function importDataset(i: ImportInput) {
  if (!i.provenance.trim()) throw new Error("Asal-usul (provenance) data wajib diisi");
  if (!i.versionLabel.trim()) throw new Error("Label versi wajib diisi");
  if (isPilot() && i.isDemo) throw new Error("Dataset demonstrasi/fiktif tidak boleh diimpor pada mode PILOT.");
  const rows = await parseRows(i.buffer, i.filename);
  const validation = validateImport(i.kind, rows, { sourceDate: i.sourceDate });
  if (validation.errors.length) throw new Error("Impor ditolak: " + validation.errors.join(" "));
  const recs = rows
    .map((r) => {
      const title = pick(r, "title");
      if (!title) return null;
      const issn = fixIssn(pick(r, "issn"));
      const eissn = fixIssn(pick(r, "eissn"));
      const url = pick(r, "url");
      const hij = pick(r, "hijackedUrl");
      const data: Record<string, unknown> = {};
      for (const f of ["quartile", "sjr", "categories", "country", "coverage", "year", "note", "discontinuedQuality", "hijackedUrl"] as const) {
        const v = pick(r, f);
        if (v) data[f] = v;
      }
      if (i.kind === "HIJACKED") { data.authenticUrl = url; data.hijackedUrl = hij; }
      return {
        kind: i.kind, title, normTitle: normalizeTitle(title), issn, eissn, sourceId: pick(r, "sourceId") || null,
        publisher: pick(r, "publisher") || null,
        domain: registrableDomain(i.kind === "HIJACKED" ? hij || url : url),
        url: url || null, status: pick(r, "status") || null, dataJson: JSON.stringify(data),
      };
    })
    .filter(Boolean) as Array<{ kind: string; title: string; normTitle: string; issn: string | null; eissn: string | null; sourceId: string | null; publisher: string | null; domain: string | null; url: string | null; status: string | null; dataJson: string }>;
  if (!recs.length) throw new Error("Tidak ada baris valid (kolom judul tidak ditemukan?)");

  const ds = await prisma.referenceDataset.create({
    data: {
      kind: i.kind, filename: i.filename, versionLabel: i.versionLabel, provenance: i.provenance, sourceDate: i.sourceDate ?? null,
      isComplete: i.isComplete, isDemo: !!i.isDemo, rowCount: recs.length, sha256: createHash("sha256").update(i.buffer).digest("hex"),
      importedById: i.actor.id, validationJson: JSON.stringify(validation),
    },
  });
  for (let k = 0; k < recs.length; k += 500) {
    await prisma.referenceRecord.createMany({ data: recs.slice(k, k + 500).map((r) => ({ ...r, datasetId: ds.id })) });
  }
  await audit(i.actor, "DATASET_IMPORTED", "ReferenceDataset", ds.id, { kind: i.kind, filename: i.filename, rows: recs.length, version: i.versionLabel, demo: !!i.isDemo, sourceDate: i.sourceDate?.toISOString() ?? null, warnings: validation.warnings, sha256: ds.sha256 });
  return ds;
}

export async function activeDatasets(kind: DatasetKind) {
  return prisma.referenceDataset.findMany({ where: { kind, active: true }, orderBy: { importedAt: "desc" } });
}

export interface RefQuery { issn?: string | null; eissn?: string | null; sourceId?: string | null; title?: string | null }

/** Pencarian berbasis IDENTIFIER lebih dahulu; kecocokan judul-saja ditandai sebagai kecocokan lemah. */
export async function lookupReference(kind: DatasetKind, q: RefQuery) {
  const datasets = await activeDatasets(kind);
  if (!datasets.length) return { datasets, matches: [] as Awaited<ReturnType<typeof prisma.referenceRecord.findMany>>, matchedBy: null as null | "IDENTIFIER" | "TITLE" };
  const ids = datasets.map((d) => d.id);
  const issns = [q.issn, q.eissn].map((x) => normalizeIssn(x)).filter(Boolean) as string[];
  const or: any[] = [];
  if (issns.length) or.push({ issn: { in: issns } }, { eissn: { in: issns } });
  if (q.sourceId) or.push({ sourceId: q.sourceId });
  if (or.length) {
    const m = await prisma.referenceRecord.findMany({ where: { datasetId: { in: ids }, OR: or } });
    if (m.length) return { datasets, matches: m, matchedBy: "IDENTIFIER" as const };
  }
  const nt = normalizeTitle(q.title);
  if (nt) {
    const m = await prisma.referenceRecord.findMany({ where: { datasetId: { in: ids }, normTitle: nt } });
    if (m.length) return { datasets, matches: m, matchedBy: "TITLE" as const };
  }
  return { datasets, matches: [], matchedBy: null };
}

export async function listDatasets() {
  return prisma.referenceDataset.findMany({ orderBy: { importedAt: "desc" } });
}
