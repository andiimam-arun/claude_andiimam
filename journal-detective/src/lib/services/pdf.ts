import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { LetterSnapshot } from "./letters";
import type { EvidenceRecord, JournalDecision } from "../engine/types";
import { reasonText, actionText, t } from "../i18n";

const NAVY = rgb(0.07, 0.125, 0.24);
const GREY = rgb(0.35, 0.38, 0.45);

/** Fon standar PDF hanya mendukung WinAnsi; karakter lain diganti agar tidak menggagalkan pembuatan PDF. */
function safe(s: string): string {
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, "->").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—…•]/g, "?");
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(public doc: PDFDocument, public font: PDFFont, public bold: PDFFont, public onNewPage: (p: PDFPage) => void, public margin = 56) {
    this.addPage();
  }
  addPage() {
    this.page = this.doc.addPage([595.28, 841.89]);
    this.y = 841.89 - this.margin - 10;
    this.onNewPage(this.page);
  }
  ensure(h: number) {
    if (this.y - h < this.margin + 20) this.addPage();
  }
  wrap(text: string, size: number, width: number, font = this.font): string[] {
    const lines: string[] = [];
    for (const para of safe(text).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/)) {
        const cand = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(cand, size) > width && line) { lines.push(line); line = w; } else line = cand;
      }
      lines.push(line);
    }
    return lines;
  }
  text(text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number; align?: "left" | "center" } = {}) {
    const size = o.size ?? 10.5;
    const font = o.bold ? this.bold : this.font;
    const width = 595.28 - this.margin * 2 - (o.indent ?? 0);
    for (const line of this.wrap(text, size, width, font)) {
      this.ensure(size + 4);
      const w = font.widthOfTextAtSize(line, size);
      const x = o.align === "center" ? (595.28 - w) / 2 : this.margin + (o.indent ?? 0);
      this.page.drawText(line, { x, y: this.y, size, font, color: o.color ?? rgb(0.1, 0.1, 0.12) });
      this.y -= size + 4;
    }
    this.y -= o.gap ?? 4;
  }
  kv(k: string, v: string) {
    const size = 10.5;
    const kw = 140;
    const lines = this.wrap(v || "-", size, 595.28 - this.margin * 2 - kw - 8);
    this.ensure(lines.length * (size + 4));
    this.page.drawText(safe(k), { x: this.margin, y: this.y, size, font: this.bold, color: GREY });
    for (const l of lines) {
      this.page.drawText(l, { x: this.margin + kw, y: this.y, size, font: this.font, color: rgb(0.1, 0.1, 0.12) });
      this.y -= size + 4;
    }
    this.y -= 1;
  }
  rule() {
    this.page.drawLine({ start: { x: this.margin, y: this.y }, end: { x: 595.28 - this.margin, y: this.y }, thickness: 0.8, color: NAVY });
    this.y -= 10;
  }
}

function watermark(p: PDFPage, font: PDFFont, label: string) {
  const size = 46;
  const w = font.widthOfTextAtSize(label, size);
  p.drawText(label, { x: 595.28 / 2 - (w / 2) * Math.cos(Math.PI / 4), y: 841.89 / 2 - (w / 2) * Math.sin(Math.PI / 4), size, font, color: rgb(0.85, 0.15, 0.15), opacity: 0.16, rotate: degrees(45) });
}

export interface LetterPdfInput {
  snapshot: LetterSnapshot;
  status: "DRAFT" | "ISSUED" | "REVOKED";
  officialNumber: string | null;
  approverName: string | null;
  approverTitle: string | null;
  approvedAt: Date | null;
  verifyUrl: string | null;
}

export async function renderLetterPdf(i: LetterPdfInput): Promise<Uint8Array> {
  const s = i.snapshot;
  const doc = await PDFDocument.create();
  doc.setTitle(safe(s.title));
  doc.setProducer("Journal Detective");
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const isDraft = i.status !== "ISSUED";
  const w = new Writer(doc, font, bold, (p) => {
    if (isDraft) watermark(p, bold, i.status === "REVOKED" ? "DICABUT" : "DRAF - BELUM DISETUJUI");
    p.drawText(safe(`${s.branding.institution} - ${s.branding.faculty}`), { x: 56, y: 30, size: 8, font, color: GREY });
  });
  w.text(s.branding.institution.toUpperCase(), { size: 14, bold: true, align: "center", gap: 0, color: NAVY });
  w.text(s.branding.faculty, { size: 12, bold: true, align: "center", gap: 0 });
  w.text(s.branding.unit, { size: 11, align: "center", gap: 0 });
  w.text(s.branding.address, { size: 9, align: "center", gap: 2, color: GREY });
  w.rule();
  w.text(s.title, { size: 12.5, bold: true, align: "center", gap: 2 });
  w.text(isDraft ? "Nomor: [NOMOR SURAT RESMI - diisi oleh pejabat berwenang saat penerbitan]" : `Nomor: ${i.officialNumber}`, { size: 10.5, align: "center", gap: 2 });
  w.text(`Nomor penilaian: ${s.assessmentRef}`, { size: 9.5, align: "center", gap: 10, color: GREY });
  if (s.policyIsDemo) w.text("PERHATIAN: dokumen ini dihasilkan dengan KEBIJAKAN DEMONSTRASI (bukan peraturan resmi fakultas).", { size: 9.5, bold: true, color: rgb(0.7, 0.1, 0.1), gap: 8 });
  w.text(s.opening, { gap: 8 });
  w.kv("Nama mahasiswa", s.student.name);
  w.kv("NIM", s.student.number);
  w.kv("Program studi", s.student.program);
  w.kv("Dosen pembimbing", s.student.supervisor);
  w.y -= 6;
  w.kv("Judul naskah", s.manuscript.title);
  w.kv("Tahap", s.manuscript.stage);
  if (s.manuscript.trackingId) w.kv("ID pelacakan", s.manuscript.trackingId);
  w.y -= 6;
  w.kv("Jurnal", s.journal.title);
  w.kv("ISSN / E-ISSN", [s.journal.issn, s.journal.eissn].filter(Boolean).join(" / ") || "-");
  w.kv("Penerbit", s.journal.publisher ?? "-");
  w.kv("Situs resmi terverifikasi", s.journal.verifiedWebsites.length ? s.journal.verifiedWebsites.join(", ") : "Belum ada domain resmi terverifikasi");
  if (s.journal.submittedWebsite) w.kv("Situs yang diajukan", s.journal.submittedWebsite);
  w.kv("Penilaian indeksasi", s.indexingAssessment);
  w.kv("Tanggal penilaian", s.assessmentDate);
  w.y -= 6;
  w.kv("Status jurnal (identitas)", s.statuses.journal);
  w.kv("Status tujuan pengiriman", s.statuses.destination ?? "-");
  w.kv("Status administratif", s.statuses.administrative);
  w.kv("Rekomendasi akhir", s.statuses.final);
  w.y -= 4;
  w.text("Kesimpulan verifikasi:", { bold: true, gap: 2 });
  for (const c of s.conclusions) w.text(`- ${c}`, { size: 9.5, indent: 8, gap: 1 });
  w.y -= 6;
  w.text(s.approvalStatement, { gap: 6 });
  if (s.override) w.text(`Catatan pengecualian oleh pejabat: ${s.override.justification}`, { size: 9.5, gap: 6 });
  w.text(s.closing, { size: 9.5, gap: 12, color: GREY });
  w.ensure(150);
  const dateLine = i.approvedAt ? `${s.branding.city}, ${i.approvedAt.toISOString().slice(0, 10)}` : `${s.branding.city}, [tanggal penerbitan]`;
  w.text(dateLine, { gap: 2 });
  w.text(isDraft ? "Menyetujui," : `${i.approverTitle ?? s.branding.approverTitle},`, { gap: 2 });
  if (isDraft) {
    w.text("[Belum disetujui - draf tidak berlaku sebagai surat resmi]", { size: 9.5, color: rgb(0.7, 0.1, 0.1), gap: 2 });
  } else {
    w.text("[Tempat tanda tangan basah / tanda tangan elektronik tersertifikasi - integrasi belum diaktifkan]", { size: 9, color: GREY, gap: 24 });
  }
  w.text(i.approverName || s.branding.approverName || "[Nama pejabat berwenang]", { bold: true, gap: 0 });
  if (s.branding.approverNip && !isDraft) w.text(`NIP ${s.branding.approverNip}`, { size: 9.5, gap: 4 });
  if (i.verifyUrl && !isDraft) {
    const png = await QRCode.toBuffer(i.verifyUrl, { margin: 1, width: 180 });
    const img = await doc.embedPng(png);
    w.ensure(90);
    w.page.drawImage(img, { x: 595.28 - 56 - 70, y: w.y - 60, width: 70, height: 70 });
    w.page.drawText("Pindai untuk verifikasi keaslian", { x: 595.28 - 56 - 130, y: w.y - 70, size: 7.5, font, color: GREY });
  }
  return doc.save();
}

export interface ReportInput {
  lang: "id" | "en";
  journalTitle: string;
  refNumber: string;
  createdAt: Date;
  policyVersion: number;
  policyIsDemo: boolean;
  identity: { issn?: string | null; eissn?: string | null; publisher?: string | null; submittedWebsite?: string | null };
  decision: JournalDecision;
  evidence: EvidenceRecord[];
}

export async function renderAssessmentReport(r: ReportInput): Promise<Uint8Array> {
  const L = r.lang;
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`Laporan Penilaian ${r.refNumber}`));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, (p) => {
    p.drawText(safe(`Journal Detective - ${r.refNumber} - hanya bersifat penasihat / advisory only`), { x: 56, y: 30, size: 8, font, color: GREY });
  }, 48);
  w.text("JOURNAL DETECTIVE", { size: 9, bold: true, color: GREY, gap: 0 });
  w.text(L === "id" ? "Laporan Penilaian Integritas Jurnal" : "Journal Integrity Assessment Report", { size: 18, bold: true, color: NAVY, gap: 4 });
  w.text(r.journalTitle, { size: 13, bold: true, gap: 6 });
  w.rule();
  const sc = r.decision.journalStatus === "GREEN" ? rgb(0.08, 0.5, 0.24) : r.decision.journalStatus === "YELLOW" ? rgb(0.7, 0.33, 0.04) : rgb(0.72, 0.11, 0.11);
  w.text(`${t(L, "dim.journal")}: ${t(L, `status.${r.decision.journalStatus}`)} - ${t(L, `status.${r.decision.journalStatus}.long`)}`, { size: 14, bold: true, color: sc, gap: 2 });
  if (r.decision.redCategory) w.text(t(L, `red.${r.decision.redCategory}`), { size: 10.5, bold: true, color: sc, gap: 4 });
  if (r.policyIsDemo) w.text(t(L, "app.demoPolicyBanner"), { size: 9, bold: true, color: rgb(0.7, 0.1, 0.1), gap: 6 });
  w.kv("Ref.", r.refNumber);
  w.kv(L === "id" ? "Tanggal" : "Date", r.createdAt.toISOString().slice(0, 16).replace("T", " ") + " UTC");
  w.kv(L === "id" ? "Versi kebijakan" : "Policy version", String(r.policyVersion));
  w.kv("ISSN / E-ISSN", [r.identity.issn, r.identity.eissn].filter(Boolean).join(" / ") || "-");
  w.kv(L === "id" ? "Penerbit" : "Publisher", r.identity.publisher ?? "-");
  w.kv(L === "id" ? "Situs diajukan" : "Submitted site", r.identity.submittedWebsite ?? "-");
  w.y -= 6;
  w.kv(L === "id" ? "Identitas" : "Identity", t(L, `ident.${r.decision.identityStatus}`));
  w.kv(L === "id" ? "Tujuan pengiriman" : "Submission destination", `${t(L, `status.${r.decision.destinationStatus}`)} - ${t(L, `web.${r.decision.websiteStatus}`)}${r.decision.destinationHost ? ` (${r.decision.destinationHost})` : ""}`);
  w.kv("Scopus", `${t(L, `idx.${r.decision.indexingStatus}`)}${r.decision.indexingBasis ? ` [${t(L, `integ.${r.decision.indexingBasis}`)}]` : ""}${r.decision.indexingDataDate ? ` ${r.decision.indexingDataDate.slice(0, 10)}` : ""}`);
  w.kv(L === "id" ? "Kelayakan kebijakan" : "Policy eligibility", t(L, `elig.${r.decision.policyEligibility}`));
  w.kv(L === "id" ? "Risiko predator" : "Predatory risk", t(L, `pred.${r.decision.predatoryAssessment}`));
  w.y -= 8;
  w.text(L === "id" ? "Alasan penilaian" : "Reasons for assessment", { size: 12, bold: true, color: NAVY });
  for (const x of r.decision.reasons) w.text(`[${x.level === "INFO" ? "INFO" : t(L, `status.${x.level}`)}] ${reasonText(L, x)}`, { size: 9.5, indent: 6, gap: 2 });
  w.y -= 6;
  w.text(L === "id" ? "Tindakan lanjutan yang disarankan" : "Recommended next actions", { size: 12, bold: true, color: NAVY });
  for (const a of r.decision.nextActions) w.text(`- ${actionText(L, a)}`, { size: 9.5, indent: 6, gap: 2 });
  w.y -= 6;
  w.text(L === "id" ? "Catatan bukti" : "Evidence records", { size: 12, bold: true, color: NAVY });
  for (const e of r.evidence) {
    w.text(`${t(L, `check.${e.check}`)} | ${e.key}`, { size: 9, bold: true, gap: 0, color: GREY });
    w.text(e.finding, { size: 9.5, gap: 0 });
    w.text(
      `${t(L, `ev.status.${e.status}`)} | ${t(L, `integ.${e.integration}`)} | ${L === "id" ? "sumber" : "source"}: ${e.sourceName}${e.sourceUrl ? ` <${e.sourceUrl}>` : ""}${e.sourceRef ? ` (${e.sourceRef})` : ""} | ${L === "id" ? "diambil" : "retrieved"}: ${e.retrievedAt.slice(0, 10)}${e.sourceDataDate ? ` | ${L === "id" ? "data" : "data date"}: ${e.sourceDataDate.slice(0, 10)}` : ""} | ${t(L, `sev.${e.severity}`)} / ${t(L, `strength.${e.strength}`)}${e.requiresHumanConfirmation ? ` | ${t(L, `review.${e.review}`)}` : ""}`,
      { size: 8, gap: 5, color: GREY },
    );
  }
  w.y -= 6;
  w.text(t(L, "app.advisory"), { size: 8.5, bold: true, color: GREY });
  return doc.save();
}
