import type { ExtractedFields } from "./extract";
import { titleSimilarity } from "./extract";
import { normalizeIssn } from "./issn";
import { registrableDomain } from "./domain";
import { normalizeTitle } from "./util";
import type { DetectedFlag } from "./anomalies";

export interface AppFacts {
  manuscriptTitle: string;
  journalName: string;
  journalIssns: string[]; // ISSN dari identitas jurnal (klaim & registri)
  trackingId?: string | null;
  journalDomains: string[]; // domain resmi terverifikasi
  submissionDate?: string | null; // ISO
}

export interface DocFacts {
  id: string;
  docType: string;
  filename: string;
  fields: Partial<ExtractedFields>;
}

const PAYMENT_TYPES = new Set(["APC_INVOICE", "PAYMENT_INSTRUCTIONS"]);

/**
 * Mendeteksi ketidakkonsistenan antar dokumen & data permohonan.
 * SEMUA keluaran adalah tanda peninjauan, bukan bukti pemalsuan.
 */
export function detectDocumentInconsistencies(app: AppFacts, docs: DocFacts[]): Array<DetectedFlag & { documentId?: string }> {
  const flags: Array<DetectedFlag & { documentId?: string }> = [];
  const push = (f: DetectedFlag, documentId?: string) => flags.push({ ...f, documentId });
  const appIssns = app.journalIssns.map((i) => normalizeIssn(i)).filter(Boolean) as string[];
  const ids = new Map<string, string>();

  for (const d of docs) {
    const f = d.fields;
    if (f.title && titleSimilarity(f.title, app.manuscriptTitle) < 0.5) {
      push({ code: "title_mismatch", severity: "MEDIUM", message: `Judul pada "${d.filename}" ("${f.title.slice(0, 80)}") berbeda dari judul naskah pada permohonan.` }, d.id);
    }
    if (f.journalName && normalizeTitle(f.journalName) !== normalizeTitle(app.journalName) && titleSimilarity(f.journalName, app.journalName) < 0.6) {
      push({ code: "journal_mismatch", severity: "MEDIUM", message: `Nama jurnal pada "${d.filename}" ("${f.journalName}") tidak sama dengan jurnal yang diajukan.` }, d.id);
    }
    const docIssns = (f.issns ?? []).map((i) => normalizeIssn(i)).filter(Boolean) as string[];
    if (docIssns.length && appIssns.length && !docIssns.some((i) => appIssns.includes(i))) {
      push({ code: "issn_mismatch", severity: "HIGH", message: `ISSN pada "${d.filename}" (${docIssns.join(", ")}) tidak cocok dengan ISSN jurnal (${appIssns.join(", ")}).` }, d.id);
    }
    if (f.manuscriptId) {
      const norm = f.manuscriptId.toUpperCase();
      if (app.trackingId && app.trackingId.toUpperCase() !== norm && !norm.includes(app.trackingId.toUpperCase())) {
        push({ code: "manuscript_id_mismatch_app", severity: "MEDIUM", message: `ID naskah pada "${d.filename}" (${f.manuscriptId}) berbeda dari ID pelacakan pada permohonan (${app.trackingId}).` }, d.id);
      }
      for (const [otherId, otherName] of ids) {
        if (otherId !== norm) push({ code: "manuscript_id_mismatch_docs", severity: "MEDIUM", message: `ID naskah berbeda antar dokumen: ${f.manuscriptId} ("${d.filename}") vs ${otherId} ("${otherName}").` }, d.id);
      }
      ids.set(norm, d.filename);
    }
    // Domain editorial / pembayaran
    if (app.journalDomains.length) {
      const offs = app.journalDomains.map((x) => registrableDomain(x)).filter(Boolean) as string[];
      const foreign = (f.domains ?? []).filter((x) => !offs.includes(x) && !GENERIC_MAIL.has(x));
      if (PAYMENT_TYPES.has(d.docType) && foreign.length) {
        push({ code: "payment_domain_mismatch", severity: "HIGH", message: `Dokumen pembayaran "${d.filename}" merujuk domain di luar domain resmi jurnal (${foreign.join(", ")}). Verifikasi tujuan pembayaran sebelum melanjutkan.` }, d.id);
      } else if (d.docType === "EDITORIAL_CORRESPONDENCE" || d.docType === "ACCEPTANCE_LETTER") {
        const emailDoms = (f.emails ?? []).map((e) => registrableDomain(e.split("@")[1])).filter(Boolean) as string[];
        const bad = emailDoms.filter((x) => !offs.includes(x));
        if (bad.length) {
          const generic = bad.filter((x) => GENERIC_MAIL.has(x));
          push({
            code: "editor_domain_mismatch",
            severity: generic.length === bad.length ? "MEDIUM" : "LOW",
            message: `Alamat surel pada "${d.filename}" memakai domain di luar domain resmi jurnal (${bad.join(", ")}). Banyak jurnal sah memakai sistem pihak ketiga; tinjau manual.`,
          }, d.id);
        }
      }
    }
    // Tanggal terhadap tanggal pengiriman
    if (app.submissionDate && d.docType === "ACCEPTANCE_LETTER" && (f.dates ?? []).some((x) => x < app.submissionDate!.slice(0, 10))) {
      push({ code: "date_before_submission", severity: "LOW", message: `"${d.filename}" memuat tanggal sebelum tanggal pengiriman pada permohonan; periksa konteksnya.` }, d.id);
    }
  }
  return flags;
}

const GENERIC_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "proton.me", "protonmail.com", "mail.com", "aol.com", "yandex.com", "icloud.com"]);
