import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { rmSync } from "node:fs";
import { prisma } from "@/lib/db";
import { importDataset } from "@/lib/services/reference";
import { createApplication, evaluateApplication, setChecklist, resolveFlag, refreshFlags } from "@/lib/services/applications";
import { uploadDocument } from "@/lib/services/documents";
import { performReviewAction, ActionError } from "@/lib/services/approval";
import { createOrRefreshDraft, issueLetter, IssueError, publicVerification } from "@/lib/services/letters";
import { runInvestigation, addManualEvidence, reviewEvidence } from "@/lib/services/investigation";
import { publishPolicy, getActivePolicy } from "@/lib/services/policyService";
import { renderLetterPdf } from "@/lib/services/pdf";
import { validateUpload } from "@/lib/security/upload";
import { assertSafeUrl, isPrivateIp, UnsafeUrlError } from "@/lib/security/safeFetch";
import { extractFields } from "@/lib/engine/extract";
import { isValidIssn } from "@/lib/engine/issn";
import { parseJson } from "@/lib/engine/util";
import { activeFindings } from "@/lib/services/destinationFindings";

type U = { id: string; name: string; role: "STUDENT" | "REVIEWER" | "HEAD" | "ADMIN" };
let admin: U, reviewer: U, head: U, student: U;

const SCOPUS = `Source Title,Print-ISSN,E-ISSN,Active or Inactive,Publisher's Name,Sourceid
Jurnal Aktif Uji (FIKTIF),99000016,,Active,Penerbit Uji,111
Jurnal Berhenti Uji (FIKTIF),9900-0024,,Inactive,Penerbit Berhenti,222
`;
const HIJ = `Journal Name,ISSN,Authentic URL,Hijacked URL
Jurnal Aktif Uji (FIKTIF),9900-0016,https://aktif-uji.example,https://aktif-uji-online.example
`;

const form = (over: Record<string, any> = {}) => ({
  studentName: "Mahasiswa Uji", studentNumber: "K0123456", studyProgram: "Prodi Uji", supervisor: "Dr. Uji", studentEmail: "m@jd.example",
  manuscriptTitle: "Judul Naskah Uji Integritas Jurnal", researchField: "Kesehatan", stage: "PRE_SUBMISSION" as const, journalName: "Jurnal Aktif Uji (FIKTIF)",
  journalIssn: "9900-0016", journalPublisher: "Penerbit Uji", claimedIndexing: "Scopus", journalUrl: "https://aktif-uji.example", ...over,
});

beforeAll(async () => {
  rmSync("./storage-test", { recursive: true, force: true });
  const h = await bcrypt.hash("x", 4);
  const mk = async (role: U["role"], n: string) => { const u = await prisma.user.create({ data: { email: `${n}@t.example`, name: n, role, passwordHash: h } }); return { id: u.id, name: u.name, role } as U; };
  admin = await mk("ADMIN", "admin"); reviewer = await mk("REVIEWER", "rev"); head = await mk("HEAD", "head"); student = await mk("STUDENT", "stu");
  const recent = new Date(Date.now() - 20 * 86_400_000);
  await importDataset({ kind: "SCOPUS_SOURCE_LIST", buffer: Buffer.from(SCOPUS), filename: "s.csv", versionLabel: "uji", provenance: "fiktif uji", sourceDate: recent, isComplete: true, isDemo: true, actor: admin });
  await importDataset({ kind: "HIJACKED", buffer: Buffer.from(HIJ), filename: "h.csv", versionLabel: "uji", provenance: "fiktif uji", sourceDate: recent, isComplete: true, isDemo: true, actor: admin });
});

describe("registri & impor", () => {
  it("impor memulihkan ISSN tanpa tanda hubung/nol depan hanya bila checksum sah dan mencatat asal-usul", async () => {
    const ds = await prisma.referenceDataset.findFirstOrThrow({ where: { kind: "SCOPUS_SOURCE_LIST", provenance: "fiktif uji" } });
    expect(ds.provenance).toBe("fiktif uji");
    expect(ds.sha256).toHaveLength(64);
    const r = await prisma.referenceRecord.findFirstOrThrow({ where: { sourceId: "111" } });
    expect(r.issn).toBe("9900-0016");
  });
  it("impor tanpa asal-usul ditolak", async () => {
    await expect(importDataset({ kind: "BEALL", buffer: Buffer.from("Title\nX"), filename: "b.csv", versionLabel: "v", provenance: " ", isComplete: true, actor: admin })).rejects.toThrow(/Asal-usul/);
  });
  it("investigasi ulang jurnal yang sama memakai kembali catatan registri (tidak duplikat) dan memvalidasi ulang", async () => {
    const identity = { title: "Jurnal Aktif Uji (FIKTIF)", altTitles: [], issn: "9900-0016", publisher: "Penerbit Uji", subjects: [], claimedIndexing: ["Scopus"], submittedWebsite: "https://aktif-uji.example" };
    const r1 = await runInvestigation({ identity, actor: reviewer });
    const r2 = await runInvestigation({ identity: { ...identity, issn: null, title: "jurnal aktif uji (fiktif)" }, actor: reviewer });
    expect(r2.journalId).toBe(r1.journalId);
    expect(r2.created).toBe(false);
    expect(r2.assessmentId).not.toBe(r1.assessmentId);
    expect(r1.decision.journalStatus).toBe("GREEN");
    expect(r1.decision.indexingBasis).toBe("IMPORTED_DATA");
  });
});

describe("Case C/H pada tingkat layanan — situs klon", () => {
  it("klon dilaporkan → KUNING; setelah peninjau mengonfirmasi → MERAH & persetujuan Kepala diblokir", async () => {
    const app = await createApplication(form({ stage: "ACCEPTED", submissionDate: "2026-07-01", journalUrl: "https://aktif-uji-online.example" }), student, student.id);
    let ev = await evaluateApplication(app);
    expect(ev.journal!.websiteStatus).toBe("SUSPICIOUS");
    expect(ev.final!.status).toBe("YELLOW");
    const e = await prisma.evidence.findFirstOrThrow({ where: { assessmentId: app.assessmentId!, key: "hijack.website" } });
    await reviewEvidence({ journalId: app.journalId!, fingerprint: e.fingerprint, decision: "CONFIRMED", note: "Terkonfirmasi klon pada daftar rujukan", actor: reviewer });
    await performReviewAction({ applicationId: app.id, actor: reviewer, action: "REASSESS", rationale: "Penilaian ulang setelah konfirmasi." });
    const fresh = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    // surat penerimaan valid tidak menolong
    await uploadDocument({ applicationId: app.id, docType: "ACCEPTANCE_LETTER", filename: "a.txt", data: Buffer.from("Jurnal Aktif Uji ISSN 9900-0016\nManuscript ID: X-1"), actor: student });
    await setChecklist(app.id, "ACCEPTANCE_LETTER", "MET", null, reviewer);
    await setChecklist(app.id, "SUBMISSION_ACK", "MET", null, reviewer);
    ev = await evaluateApplication(fresh);
    expect(ev.journal!.websiteStatus).toBe("UNSAFE_CONFIRMED_CLONE");
    expect(ev.final!.status).toBe("RED");
    expect(ev.final!.hardBlock).toBe(true);
    // temuan klon PERMANEN per host: tetap aktif walau penilaian berikutnya memakai situs resmi (jurnal HIJAU)
    const authentic = await runInvestigation({ identity: { title: "Jurnal Aktif Uji (FIKTIF)", altTitles: [], issn: "9900-0016", subjects: [], claimedIndexing: [], submittedWebsite: "https://aktif-uji.example" }, actor: reviewer });
    expect(authentic.decision.journalStatus).toBe("GREEN");
    expect(authentic.decision.destinationStatus).toBe("GREEN");
    const fnd = await activeFindings(app.journalId!);
    expect(fnd.active.find((f) => f.host === "beda-total-uji.example" || f.host === "aktif-uji-online.example")?.status).toBe("CLONE_CONFIRMED");
    await expect(performReviewAction({ applicationId: app.id, actor: head, action: "APPROVE", rationale: "Mencoba override klon dengan justifikasi panjang." })).rejects.toThrow(/diblokir/);
    await expect(performReviewAction({ applicationId: app.id, actor: head, action: "APPROVE", rationale: "Mencoba override klon dengan justifikasi panjang." })).rejects.toBeInstanceOf(ActionError);
  });
});

describe("Case I — penerbitan surat resmi", () => {
  it("administrator hanya dapat membuat draf; penerbitan ditolak dan tercatat", async () => {
    const app = await createApplication(form(), student, student.id);
    const lid = await createOrRefreshDraft(app.id, "PRE_SUBMISSION", admin);
    const l = await prisma.letter.findUniqueOrThrow({ where: { id: lid } });
    expect(l.status).toBe("DRAFT");
    expect(l.officialNumber).toBeNull();
    await expect(issueLetter(lid, admin, "ADM/001")).rejects.toBeInstanceOf(IssueError);
    await expect(issueLetter(lid, head, "HEAD/001")).rejects.toThrow(/persetujuan/i); // belum APPROVED
    expect(await publicVerification(l.verifyToken)).toBeNull(); // draf tidak pernah terbuka publik
    const pdf = await renderLetterPdf({ snapshot: JSON.parse(l.snapshotJson), status: "DRAFT", officialNumber: null, approverName: null, approverTitle: null, approvedAt: null, verifyUrl: null });
    expect(Buffer.from(pdf.subarray(0, 4)).toString()).toBe("%PDF");
    const denied = await prisma.auditLog.count({ where: { action: "LETTER_ISSUE_DENIED", entityId: lid } });
    expect(denied).toBeGreaterThanOrEqual(2);
  });
  it("alur lengkap: rekomendasi peninjau → persetujuan Kepala → nomor manual → terbit; peninjau tak bisa APPROVE", async () => {
    const app = await createApplication(form(), student, student.id);
    await expect(performReviewAction({ applicationId: app.id, actor: reviewer, action: "APPROVE", rationale: "Saya mencoba menyetujui." })).rejects.toThrow(/tidak berwenang/);
    await performReviewAction({ applicationId: app.id, actor: reviewer, action: "RECOMMEND_APPROVE", rationale: "Layak disetujui oleh Kepala." });
    await performReviewAction({ applicationId: app.id, actor: head, action: "APPROVE", rationale: "Disetujui, seluruh bukti memuaskan." });
    const lid = await createOrRefreshDraft(app.id, "PRE_SUBMISSION", reviewer);
    await expect(issueLetter(lid, head, "  ")).rejects.toThrow(/Nomor surat resmi wajib/);
    const issued = await issueLetter(lid, head, "UJI/001/2026");
    expect(issued.status).toBe("ISSUED");
    expect(issued.officialNumber).toBe("UJI/001/2026");
    expect(issued.approverName).toBe("head");
    const v = await publicVerification(issued.verifyToken);
    expect(v?.status).toBe("ISSUED");
    expect(v?.studentMasked).toBe("Mahasiswa U***"); // nama dimasking
    await expect(issueLetter(lid, head, "UJI/002/2026")).rejects.toThrow(/bukan berstatus draf/);
    // watermark: draf memuat teks DRAF, surat terbit tidak; surat terbit memuat nomor resmi
    const { PDFParse } = await import("pdf-parse");
    const textOf = async (b: Uint8Array) => { const pr = new PDFParse({ data: b }); const r = await pr.getText(); await pr.destroy(); return r.text; };
    const snap = JSON.parse(issued.snapshotJson);
    const draftPdf = await renderLetterPdf({ snapshot: snap, status: "DRAFT", officialNumber: null, approverName: null, approverTitle: null, approvedAt: null, verifyUrl: null });
    const issuedPdf = await renderLetterPdf({ snapshot: snap, status: "ISSUED", officialNumber: issued.officialNumber, approverName: issued.approverName, approverTitle: issued.approverTitle, approvedAt: issued.approvedAt, verifyUrl: "http://x/verify/t" });
    const dt = await textOf(draftPdf);
    expect(dt).toContain("DRAF - BELUM DISETUJUI");
    expect(dt).toContain("NOMOR SURAT RESMI");
    const it = await textOf(issuedPdf);
    expect(it).not.toContain("DRAF - BELUM DISETUJUI");
    expect(it).toContain("UJI/001/2026");
    const act = await prisma.reviewAction.findMany({ where: { applicationId: app.id } });
    expect(act.every((a) => a.policyVersion >= 1 && a.rationale.length >= 10)).toBe(true);
  });
  it("persetujuan non-HIJAU dicatat sebagai override dengan justifikasi", async () => {
    const app = await createApplication(form({ stage: "ACCEPTED", submissionDate: "2026-07-01" }), student, student.id);
    const ev = await evaluateApplication(app);
    expect(ev.final!.status).toBe("YELLOW");
    await expect(performReviewAction({ applicationId: app.id, actor: head, action: "APPROVE", rationale: "singkat sekali" })).rejects.toThrow(/justifikasi/);
    await performReviewAction({ applicationId: app.id, actor: head, action: "APPROVE", rationale: "Bukti tambahan diterima di luar sistem dan diverifikasi manual." });
    const a = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(parseJson<any>(a.overrideJson, {}).finalStatus).toBe("YELLOW");
  });
});

describe("kebijakan berversi", () => {
  it("menerbitkan versi baru tanpa menimpa, dan keputusan memakai kebijakan aktif", async () => {
    const v1 = await getActivePolicy();
    await publishPolicy(admin, { name: "Uji", config: { ...v1.config, requireCurrentScopus: false }, isDemo: true, note: "uji versi" });
    const v2 = await getActivePolicy();
    expect(v2.version).toBe(v1.version + 1);
    expect(await prisma.policy.count()).toBeGreaterThanOrEqual(2);
    const r = await runInvestigation({ identity: { title: "Jurnal Berhenti Uji (FIKTIF)", altTitles: [], issn: "9900-0024", subjects: [], claimedIndexing: [], submittedWebsite: null }, actor: reviewer });
    expect(r.decision.policyEligibility).toBe("ELIGIBLE"); // kebijakan v2 tidak mewajibkan Scopus
    await publishPolicy(admin, { name: "Uji 3", config: v1.config, isDemo: true, note: "kembali" });
    const r3 = await runInvestigation({ identity: { title: "Jurnal Berhenti Uji (FIKTIF)", altTitles: [], issn: "9900-0024", subjects: [], claimedIndexing: [], submittedWebsite: null }, actor: reviewer });
    expect(r3.decision.journalStatus).toBe("RED");
    expect(r3.decision.redCategory).toBe("POLICY_INELIGIBLE");
    await expect(publishPolicy(admin, { name: "x", config: { requireCurrentScopus: "ya" }, isDemo: true, note: "" })).rejects.toThrow();
  });
});

describe("bukti manual", () => {
  it("bukti VERIFIED tanpa sumber ditolak (tidak boleh mengarang)", async () => {
    const r = await runInvestigation({ identity: { title: "Jurnal Manual Uji", altTitles: [], issn: "9900-0067", subjects: [], claimedIndexing: [], submittedWebsite: "https://manual-uji.example" }, actor: reviewer });
    await expect(addManualEvidence({ journalId: r.journalId, kind: "scopus.coverage", finding: "Aktif", status: "VERIFIED", sourceName: "Scopus Sources", data: { coverage: "ACTIVE" }, actor: reviewer })).rejects.toThrow(/URL sumber/);
    await addManualEvidence({ journalId: r.journalId, kind: "scopus.coverage", finding: "Aktif per cek manual", status: "VERIFIED", sourceName: "Scopus Sources", sourceUrl: "https://www.scopus.com/sources", sourceDataDate: new Date().toISOString(), data: { coverage: "ACTIVE" }, actor: reviewer });
    await addManualEvidence({ journalId: r.journalId, kind: "identity.official_domain", finding: "Situs resmi menurut penerbit", status: "VERIFIED", sourceName: "Halaman penerbit", sourceUrl: "https://penerbit-uji.example/jurnal", data: { domains: ["https://manual-uji.example"] }, actor: reviewer });
    await addManualEvidence({ journalId: r.journalId, kind: "identity.corroboration", finding: "ISSN & judul cocok pada halaman penerbit", status: "VERIFIED", sourceName: "Halaman penerbit", sourceUrl: "https://penerbit-uji.example/jurnal", data: { via: "PUBLISHER" }, actor: reviewer });
    const r2 = await runInvestigation({ identity: { title: "Jurnal Manual Uji", altTitles: [], issn: "9900-0067", subjects: [], claimedIndexing: ["Scopus"], submittedWebsite: "https://manual-uji.example" }, actor: reviewer });
    expect(r2.decision.indexingBasis).toBe("MANUAL_EVIDENCE");
    expect(r2.decision.websiteStatus).toBe("AUTHENTIC");
    expect(r2.decision.journalStatus).toBe("GREEN");
  });
});

describe("keamanan: unggahan, SSRF, ekstraksi", () => {
  it("validasi unggahan: ekstensi, magic bytes, ukuran", () => {
    const pdf = Buffer.from("%PDF-1.4 ...");
    expect(validateUpload("a.pdf", 100, pdf).ok).toBe(true);
    expect(validateUpload("a.exe", 100, pdf)).toMatchObject({ ok: false });
    expect(validateUpload("fake.pdf", 100, Buffer.from("MZ\x90\x00"))).toMatchObject({ ok: false });
    expect(validateUpload("a.png", 11 * 1024 * 1024, Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toMatchObject({ ok: false });
    expect(validateUpload("../../etc/passwd.txt", 10, Buffer.from("hi"))).toMatchObject({ ok: true, safeName: expect.not.stringContaining("/") });
  });
  it("unggahan berbahaya ditolak oleh layanan dokumen", async () => {
    const app = await createApplication(form(), student, student.id);
    await expect(uploadDocument({ applicationId: app.id, docType: "OTHER", filename: "x.pdf", data: Buffer.from("bukan pdf"), actor: student })).rejects.toThrow(/tidak sesuai/);
  });
  it("SSRF: IP privat, loopback, metadata cloud, protokol non-http, kredensial, port aneh", async () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0"]) expect(isPrivateIp(ip), ip).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    for (const u of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://localhost/", "file:///etc/passwd", "ftp://x.example/", "http://user:pw@example.com/", "https://example.com:8443/", "http://[::1]/", "http://x.internal/"]) {
      await expect(assertSafeUrl(u), u).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });
  it("ekstraksi bidang dari teks dokumen & penanda ketidakkonsistenan", async () => {
    const f = extractFields("Manuscript ID: ABC-123\nTitle: Judul Lain Sama Sekali Berbeda\nISSN 9900-0016\nDOI 10.1234/abc.5\nContact: ed@palsu.example\nPay to account: 1234 5678 90\nDate 12 September 2026");
    expect(f.manuscriptId).toBe("ABC-123");
    expect(f.issns).toEqual(["9900-0016"]);
    expect(f.dois[0]).toBe("10.1234/abc.5");
    expect(f.dates).toContain("2026-09-12");
    expect(isValidIssn("9900-0016")).toBe(true);
    const app = await createApplication(form({ stage: "ACCEPTED", submissionDate: "2026-07-01", trackingId: "XYZ-9" }), student, student.id);
    await uploadDocument({ applicationId: app.id, docType: "ACCEPTANCE_LETTER", filename: "a.txt", actor: student,
      data: Buffer.from("Manuscript ID: ABC-123\nTitle: Judul Lain Sama Sekali Berbeda Dari Permohonan\nJournal: Jurnal Lain Sekali\nISSN 9900-0024\nsend payment to http://bayar-di-sini.example") });
    await uploadDocument({ applicationId: app.id, docType: "APC_INVOICE", filename: "inv.txt", actor: student, data: Buffer.from("Invoice\nPay at https://bayar-di-sini.example/pay\nManuscript ID: DEF-456") });
    const flags = await prisma.consistencyFlag.findMany({ where: { applicationId: app.id } });
    const codes = flags.map((x) => x.code);
    for (const c of ["title_mismatch", "journal_mismatch", "issn_mismatch", "manuscript_id_mismatch_app", "manuscript_id_mismatch_docs"]) expect(codes, c).toContain(c);
    // tanda adalah petunjuk peninjauan: belum RED sampai peninjau mengonfirmasi
    let ev = await evaluateApplication(app);
    expect(ev.administrative.status).toBe("YELLOW");
    const issn = flags.find((x) => x.code === "issn_mismatch")!;
    await expect(resolveFlag(issn.id, "CONFIRMED", "pendek", reviewer)).rejects.toThrow(/10 karakter/);
    await resolveFlag(issn.id, "CONFIRMED", "ISSN pada surat bukan milik jurnal yang diajukan", reviewer);
    await refreshFlags(app.id);
    ev = await evaluateApplication(app);
    expect(ev.administrative.status).toBe("RED");
    expect(ev.final!.journalStatus).toBe("GREEN"); // RED administratif ≠ jurnal curang
    expect(ev.final!.status).toBe("RED");
  });
});

describe("audit Fase 1 — celah material", () => {
  it("persetujuan memakai penilaian yang divalidasi ulang: klon yang dikonfirmasi SETELAH penilaian tetap memblokir", async () => {
    const app = await createApplication(form({ journalUrl: "https://beda-total-uji.example" }), student, student.id);
    expect((await evaluateApplication(app)).final!.status).toBe("YELLOW"); // dugaan, belum dikonfirmasi
    const e = await prisma.evidence.findFirstOrThrow({ where: { assessmentId: app.assessmentId!, key: "hijack.website" } });
    await reviewEvidence({ journalId: app.journalId!, fingerprint: e.fingerprint, decision: "CONFIRMED", note: "Dikonfirmasi klon setelah penilaian awal", actor: reviewer });
    // penilaian tersimpan masih lama (KUNING) — tetapi persetujuan harus tetap diblokir
    await expect(performReviewAction({ applicationId: app.id, actor: head, action: "APPROVE", rationale: "Justifikasi panjang yang seharusnya tidak berlaku." })).rejects.toThrow(/diblokir/);
    const fresh = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(fresh.workflow).not.toBe("APPROVED");
  });
  it("impor XLSX berfungsi dan mencatat baris", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("s");
    ws.addRow(["Source Title", "Print-ISSN", "E-ISSN", "Active or Inactive", "Publisher's Name", "Sourceid"]);
    ws.addRow(["Jurnal XLSX Uji (FIKTIF)", "9900-0059", "", "Active", "Penerbit XLSX", "333"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const ds = await importDataset({ kind: "SCOPUS_SOURCE_LIST", buffer: buf, filename: "s.xlsx", versionLabel: "xlsx uji", provenance: "fiktif uji", sourceDate: new Date(), isComplete: true, isDemo: true, actor: admin });
    expect(ds.rowCount).toBe(1);
    const r = await runInvestigation({ identity: { title: "Jurnal XLSX Uji (FIKTIF)", altTitles: [], issn: "9900-0059", subjects: [], claimedIndexing: [], submittedWebsite: null }, actor: reviewer });
    expect(r.decision.indexingStatus).toBe("ACTIVE_VERIFIED");
    expect(r.decision.indexingBasis).toBe("IMPORTED_DATA");
  });
  it("ekstraksi teks dari PDF sungguhan dan koreksi manusia", async () => {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Manuscript ID: PDF-777", { x: 50, y: 700, size: 12, font });
    page.drawText("Title: Naskah PDF Uji Ekstraksi Otomatis", { x: 50, y: 680, size: 12, font });
    page.drawText("ISSN 9900-0016", { x: 50, y: 660, size: 12, font });
    const bytes = Buffer.from(await doc.save());
    const app = await createApplication(form({ stage: "SUBMITTED", submissionDate: "2026-07-01" }), student, student.id);
    const d = await uploadDocument({ applicationId: app.id, docType: "SUBMISSION_ACK", filename: "ack.pdf", data: bytes, actor: student });
    expect(d.extractedText).toContain("PDF-777");
    expect(parseJson<any>(d.fieldsJson, {}).manuscriptId).toBe("PDF-777");
    expect(d.fieldsReviewed).toBe(false); // belum ditinjau manusia
  });
});
