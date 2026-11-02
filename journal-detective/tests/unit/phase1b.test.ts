import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { importDataset, validateImport } from "@/lib/services/reference";
import { addManualEvidence, reviewEvidence, runInvestigation, loadAssessment } from "@/lib/services/investigation";
import { changeApplicationJournal, createApplication, evaluateApplication, setChecklist } from "@/lib/services/applications";
import { performReviewAction } from "@/lib/services/approval";
import { createOrRefreshDraft, issueLetter } from "@/lib/services/letters";
import { publishPolicy, getActivePolicy } from "@/lib/services/policyService";
import { activeFindings, findingHistory, recordFinding, retractFinding, FindingError } from "@/lib/services/destinationFindings";
import { classifyRun, coverageSummary, createCase, createCoverageShells, exportCsv, recordReference, runCase, ValidationError } from "@/lib/services/validation";
import { environmentProblems, staticConfigProblems } from "@/lib/mode";
import { makeUsers, form, withMode, type U } from "./helpers";

let u: { admin: U; reviewer: U; head: U; student: U };
const D = (days: number) => new Date(Date.now() - days * 86_400_000);

// ISSN fiktif 9901-xxxx (checksum sah). Domain .example.
const SC = `Source Title,Print-ISSN,E-ISSN,Active or Inactive,Publisher's Name,Sourceid
Jurnal 1B Aktif (FIKTIF),9901-0011,,Active,Penerbit 1B,9901001
Jurnal 1B Berhenti (FIKTIF),9901-002X,,Inactive,Penerbit 1B,9901002
`;
const HJ = `Journal Name,ISSN,Authentic URL,Hijacked URL
Jurnal 1B Aktif (FIKTIF),9901-0011,https://aktif-1b.example,https://aktif-1b-klon.example
Jurnal 1B Berhenti (FIKTIF),9901-002X,https://berhenti-1b.example,
`;
const base = { journalName: "Jurnal 1B Aktif (FIKTIF)", journalIssn: "9901-0011", journalPublisher: "Penerbit 1B", claimedIndexing: "Scopus" };

beforeAll(async () => {
  u = await makeUsers("p1b");
  await withMode("DEMO", async () => {
    await importDataset({ kind: "SCOPUS_SOURCE_LIST", buffer: Buffer.from(SC), filename: "s.csv", versionLabel: "1b demo", provenance: "fiktif", sourceDate: D(10), isComplete: true, isDemo: true, actor: u.admin });
    await importDataset({ kind: "HIJACKED", buffer: Buffer.from(HJ), filename: "h.csv", versionLabel: "1b demo", provenance: "fiktif", sourceDate: D(10), isComplete: true, isDemo: true, actor: u.admin });
  });
});

describe("1. bukti fiktif tidak dapat memberi klirens PILOT", () => {
  it("investigasi dari dataset demo pada PILOT → bukti dikecualikan, tidak HIJAU", async () => {
    const r = await withMode("PILOT", () => runInvestigation({ identity: { title: "Jurnal 1B Aktif (FIKTIF)", altTitles: [], issn: "9901-0011", subjects: [], claimedIndexing: ["Scopus"], submittedWebsite: "https://aktif-1b.example" }, actor: u.reviewer }));
    expect(r.decision.journalStatus).not.toBe("GREEN");
    expect(r.decision.destinationStatus).not.toBe("GREEN");
    expect(r.decision.indexingStatus).toBe("UNVERIFIED");
    expect(r.decision.reasons.some((x) => x.code === "demo_evidence_excluded")).toBe(true);
    // pada DEMO, data yang sama menghasilkan HIJAU (membuktikan pemisahan, bukan data rusak)
    const d = await withMode("DEMO", () => runInvestigation({ identity: { title: "Jurnal 1B Aktif (FIKTIF)", altTitles: [], issn: "9901-0011", subjects: [], claimedIndexing: ["Scopus"], submittedWebsite: "https://aktif-1b.example" }, actor: u.reviewer }));
    expect(d.decision.journalStatus).toBe("GREEN");
  });
  it("impor dataset demo ditolak pada PILOT", async () => {
    await expect(withMode("PILOT", () => importDataset({ kind: "BEALL", buffer: Buffer.from("Title\nX"), filename: "b.csv", versionLabel: "v", provenance: "p", sourceDate: D(1), isComplete: true, isDemo: true, actor: u.admin }))).rejects.toThrow(/PILOT/);
  });
  it("konfigurasi PILOT menolak basis data/penyimpanan DEMO", () => {
    expect(staticConfigProblems({ APP_MODE: "PILOT", DATABASE_URL: "file:./dev.db", STORAGE_DIR: "./storage" } as any).length).toBe(2);
    expect(staticConfigProblems({ APP_MODE: "PILOT", DATABASE_URL: "file:./pilot.db", STORAGE_DIR: "./storage-pilot" } as any)).toEqual([]);
    expect(staticConfigProblems({ APP_MODE: "DEMO", DATABASE_URL: "file:./dev.db" } as any)).toEqual([]);
  });
  it("PILOT menolak berjalan di atas basis data bertanda DEMO dan sebaliknya", async () => {
    await prisma.setting.upsert({ where: { key: "environment" }, create: { key: "environment", valueJson: JSON.stringify({ mode: "DEMO", initializedAt: "x" }) }, update: { valueJson: JSON.stringify({ mode: "DEMO", initializedAt: "x" }) } });
    const p = await withMode("PILOT", () => environmentProblems(true));
    expect(p.join(" ")).toMatch(/bertanda DEMO/);
    await prisma.setting.upsert({ where: { key: "environment" }, create: { key: "environment", valueJson: JSON.stringify({ mode: "PILOT", initializedAt: "x" }) }, update: { valueJson: JSON.stringify({ mode: "PILOT", initializedAt: "x" }) } });
    expect((await withMode("DEMO", () => environmentProblems(true))).join(" ")).toMatch(/bertanda PILOT/);
    await prisma.setting.delete({ where: { key: "environment" } });
    await environmentProblems(true);
  });
});

describe("5. kebijakan resmi belum dikonfigurasi memblokir klirens resmi (PILOT)", () => {
  it("persetujuan & penerbitan surat diblokir; setelah kebijakan resmi diterbitkan dapat berjalan dengan bukti nyata (manual)", async () => {
    // Basis data PILOT sungguhan tidak memuat dataset demo; dataset demo uji dinonaktifkan sementara agar mensimulasikan itu.
    await prisma.referenceDataset.updateMany({ data: { active: false } });
    try { await withMode("PILOT", async () => {
      const r0 = await runInvestigation({ identity: { title: "Jurnal Pilot Manual 1B", altTitles: [], issn: "9901-0038", subjects: [], claimedIndexing: [], submittedWebsite: "https://pilot-manual-1b.example" }, actor: u.reviewer });
      const src = { sourceName: "Sumber uji terkendali (bukan data nyata)", sourceUrl: "https://example.org/uji" };
      await addManualEvidence({ journalId: r0.journalId, kind: "scopus.coverage", finding: "Aktif (uji)", status: "VERIFIED", ...src, sourceDataDate: new Date().toISOString(), data: { coverage: "ACTIVE" }, actor: u.reviewer });
      await addManualEvidence({ journalId: r0.journalId, kind: "identity.official_domain", finding: "Resmi (uji)", status: "VERIFIED", ...src, data: { domains: ["https://pilot-manual-1b.example"] }, actor: u.reviewer });
      await addManualEvidence({ journalId: r0.journalId, kind: "identity.corroboration", finding: "Cocok (uji)", status: "VERIFIED", ...src, data: { via: "PUBLISHER" }, actor: u.reviewer });
      const app = await createApplication(form({ ...base, journalName: "Jurnal Pilot Manual 1B", journalIssn: "9901-0038", claimedIndexing: "", journalUrl: "https://pilot-manual-1b.example" }), u.student, u.student.id);
      expect((await evaluateApplication(app)).final!.status).toBe("GREEN");
      const pol = await getActivePolicy();
      expect(pol.isDemo).toBe(true);
      await expect(performReviewAction({ applicationId: app.id, actor: u.head, action: "APPROVE", rationale: "Mencoba menyetujui tanpa kebijakan resmi." })).rejects.toThrow(/Kebijakan resmi belum dikonfigurasi/);
      await expect(issueLetter((await createOrRefreshDraft(app.id, "PRE_SUBMISSION", u.admin)), u.head, "X/1")).rejects.toThrow(/Kebijakan resmi belum dikonfigurasi|persetujuan/);
      await publishPolicy(u.head, { name: "Kebijakan resmi uji (bukan peraturan nyata)", config: pol.config, isDemo: false, note: "uji" });
      await performReviewAction({ applicationId: app.id, actor: u.head, action: "APPROVE", rationale: "Disetujui pada pengujian terkendali." });
      expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).workflow).toBe("APPROVED");
      // kembalikan placeholder demo agar uji lain tidak terpengaruh
      await publishPolicy(u.admin, { name: "kembali", config: pol.config, isDemo: true, note: "reset uji" });
    }); } finally { await prisma.referenceDataset.updateMany({ data: { active: true } }); }
  });
});

describe("2. klon terkonfirmasi tetap memblokir setelah jurnal asli mendapat HIJAU", () => {
  it("temuan permanen per host; permohonan lain dengan situs resmi HIJAU; permohonan klon tetap MERAH", async () => {
    await withMode("DEMO", async () => {
      const clone = await createApplication(form({ ...base, journalUrl: "https://aktif-1b-klon.example" }), u.student, u.student.id);
      let ev = await evaluateApplication(clone);
      expect(ev.journal!.journalStatus).toBe("GREEN");
      expect(ev.journal!.destinationStatus).toBe("YELLOW"); // dugaan dari daftar rujukan, belum dikonfirmasi
      const e = await prisma.evidence.findFirstOrThrow({ where: { assessmentId: clone.assessmentId!, key: "hijack.website" } });
      await reviewEvidence({ journalId: clone.journalId!, fingerprint: e.fingerprint, decision: "CONFIRMED", note: "Dikonfirmasi klon (uji terkendali)", actor: u.reviewer });
      const authentic = await createApplication(form({ ...base, journalUrl: "https://aktif-1b.example" }), u.student, u.student.id);
      const evA = await evaluateApplication(authentic);
      expect([evA.journal!.journalStatus, evA.journal!.destinationStatus, evA.final!.status]).toEqual(["GREEN", "GREEN", "GREEN"]);
      // nilai ulang permohonan klon SETELAH jurnal asli mendapat HIJAU
      const { reassessApplicationJournal } = await import("@/lib/services/applications");
      await reassessApplicationJournal(clone.id, u.reviewer);
      ev = await evaluateApplication(await prisma.application.findUniqueOrThrow({ where: { id: clone.id } }));
      expect([ev.journal!.journalStatus, ev.journal!.destinationStatus, ev.final!.status]).toEqual(["GREEN", "RED", "RED"]);
      expect(ev.final!.hardBlock).toBe(true);
      await expect(performReviewAction({ applicationId: clone.id, actor: u.head, action: "APPROVE", rationale: "Justifikasi panjang yang tidak boleh berlaku." })).rejects.toThrow(/diblokir/);
      const f = await activeFindings(clone.journalId!);
      expect(f.active.find((x) => x.host === "aktif-1b-klon.example")?.status).toBe("CLONE_CONFIRMED");
    });
  });
});

describe("3. perubahan tujuan membatalkan rekomendasi", () => {
  it("rekomendasi dihapus, alur kembali ke PENDING_REVIEW, tercatat, dinilai ulang; persetujuan harus diulang", async () => {
    await withMode("DEMO", async () => {
      const app = await createApplication(form({ ...base, journalUrl: "https://aktif-1b.example" }), u.student, u.student.id);
      await performReviewAction({ applicationId: app.id, actor: u.reviewer, action: "RECOMMEND_APPROVE", rationale: "Layak disetujui oleh Kepala Unit." });
      expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).recommendation).toBe("RECOMMEND_APPROVE");
      const r = await changeApplicationJournal(app.id, { ...base, journalUrl: "https://aktif-1b-klon.example" }, u.student);
      expect(r.changed).toBe(true);
      const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
      expect(after.recommendation).toBeNull();
      expect(after.workflow).toBe("PENDING_REVIEW");
      expect(after.destinationHost).toBe("aktif-1b-klon.example");
      expect(after.invalidatedAt).toBeNull(); // sudah dinilai ulang otomatis
      expect(after.assessmentId).not.toBe(app.assessmentId);
      const log = await prisma.reviewAction.findMany({ where: { applicationId: app.id, action: "RECOMMENDATION_INVALIDATED" } });
      expect(log).toHaveLength(1);
      const ev = await evaluateApplication(after);
      expect(ev.invalidated).toBe(false);
      expect(ev.journal!.destinationStatus).not.toBe("GREEN");
      // tidak berubah → tidak membatalkan apa pun
      expect((await changeApplicationJournal(app.id, { ...base, journalUrl: "https://aktif-1b-klon.example" }, u.student)).changed).toBe(false);
    });
  });
  it("perubahan langsung di basis data (tanpa layanan) terdeteksi: rekomendasi tidak berlaku (invalidated)", async () => {
    const app = await createApplication(form({ ...base, journalUrl: "https://aktif-1b.example" }), u.student, u.student.id);
    await prisma.application.update({ where: { id: app.id }, data: { journalUrl: "https://tujuan-lain.example" } });
    const ev = await evaluateApplication(await prisma.application.findUniqueOrThrow({ where: { id: app.id } }));
    expect(ev.invalidated).toBe(true);
    expect(ev.final).toBeNull();
    expect(ev.journal).toBeNull();
  });
  it("permohonan final tidak dapat diubah", async () => {
    await withMode("DEMO", async () => {
      const app = await createApplication(form({ ...base, journalUrl: "https://aktif-1b.example" }), u.student, u.student.id);
      await performReviewAction({ applicationId: app.id, actor: u.head, action: "APPROVE", rationale: "Disetujui pada pengujian terkendali." });
      await expect(changeApplicationJournal(app.id, { ...base, journalUrl: "https://aktif-1b-klon.example" }, u.student)).rejects.toThrow(/final/);
    });
  });
});

describe("4. persetujuan menilai bukti terkini dan kebijakan aktif", () => {
  it("kebijakan lebih ketat setelah penilaian awal memblokir persetujuan", async () => {
    await withMode("DEMO", async () => {
      const p0 = await getActivePolicy();
      await publishPolicy(u.admin, { name: "longgar uji", config: { ...p0.config, requireCurrentScopus: false }, isDemo: true, note: "uji" });
      const app = await createApplication(form({ journalName: "Jurnal 1B Berhenti (FIKTIF)", journalIssn: "9901-002X", journalPublisher: "Penerbit 1B", claimedIndexing: "", journalUrl: "https://berhenti-1b.example" }), u.student, u.student.id);
      const ev0 = await evaluateApplication(app);
      expect(ev0.final!.status).toBe("GREEN"); // kebijakan lama tidak mewajibkan Scopus
      await publishPolicy(u.admin, { name: "ketat uji", config: { ...p0.config, requireCurrentScopus: true, discontinuedHandling: "INELIGIBLE", headMayOverridePolicyIneligible: false }, isDemo: true, note: "uji" });
      await expect(performReviewAction({ applicationId: app.id, actor: u.head, action: "APPROVE", rationale: "Mencoba menyetujui berdasarkan penilaian lama." })).rejects.toThrow(/tidak dapat di-override|diblokir/);
      await publishPolicy(u.admin, { name: "kembali", config: p0.config, isDemo: true, note: "reset uji" });
    });
  });
});

describe("koreksi terkontrol temuan klon keliru", () => {
  it("hanya peninjau/Kepala; rasional+bukti wajib; riwayat dipertahankan; temuan bertentangan butuh koreksi dahulu", async () => {
    await withMode("DEMO", async () => {
      const r = await runInvestigation({ identity: { title: "Jurnal 1B Aktif (FIKTIF)", altTitles: [], issn: "9901-0011", subjects: [], claimedIndexing: [], submittedWebsite: "https://koreksi-1b.example" }, actor: u.reviewer });
      const f1 = await recordFinding({ journalId: r.journalId, urlOrHost: "https://www.Koreksi-1b.example/x", status: "CLONE_CONFIRMED", basis: "Terkonfirmasi klon (uji terkendali)", sourceName: "Uji", sourceRef: "dokumen-uji-1", actor: u.reviewer });
      expect(f1.host).toBe("koreksi-1b.example");
      await expect(recordFinding({ journalId: r.journalId, urlOrHost: "koreksi-1b.example", status: "AUTHENTIC_VERIFIED", basis: "Mencoba menimpa temuan", sourceName: "Uji", sourceRef: "x", actor: u.reviewer })).rejects.toThrow(/KOREKSI/);
      await expect(recordFinding({ journalId: r.journalId, urlOrHost: "x.example", status: "CLONE_CONFIRMED", basis: "tanpa asal-usul sumber", sourceName: "Uji", actor: u.reviewer })).rejects.toBeInstanceOf(FindingError);
      const a = { findingId: f1.id, rationale: "Ternyata klon tidak terbukti; domain adalah migrasi resmi.", sourceUrl: "https://example.org/pernyataan-penerbit" };
      await expect(retractFinding({ ...a, actor: { ...u.student } })).rejects.toThrow(/peninjau/);
      await expect(retractFinding({ ...a, actor: u.admin })).rejects.toThrow(/peninjau/);
      await expect(retractFinding({ ...a, rationale: "pendek", actor: u.reviewer })).rejects.toThrow(/20 karakter/);
      await expect(retractFinding({ findingId: f1.id, rationale: a.rationale, actor: u.reviewer })).rejects.toThrow(/bukti pendukung/);
      // sebelum koreksi: MERAH
      let d = (await runInvestigation({ identity: { title: "Jurnal 1B Aktif (FIKTIF)", altTitles: [], issn: "9901-0011", subjects: [], claimedIndexing: [], submittedWebsite: "https://koreksi-1b.example" }, actor: u.reviewer })).decision;
      expect(d.destinationStatus).toBe("RED");
      await retractFinding({ ...a, actor: u.reviewer });
      const hist = await findingHistory(r.journalId);
      expect(hist.filter((x) => x.host === "koreksi-1b.example").map((x) => x.status).sort()).toEqual(["CLONE_CONFIRMED", "RETRACTED"]); // riwayat utuh
      expect((await activeFindings(r.journalId)).active.some((x) => x.host === "koreksi-1b.example")).toBe(false);
      d = (await runInvestigation({ identity: { title: "Jurnal 1B Aktif (FIKTIF)", altTitles: [], issn: "9901-0011", subjects: [], claimedIndexing: [], submittedWebsite: "https://koreksi-1b.example" }, actor: u.reviewer })).decision;
      expect(d.destinationStatus).not.toBe("RED");
      expect(d.identityFraudBlock).toBe(false);
      await expect(retractFinding({ ...a, actor: u.reviewer })).rejects.toThrow(/bukan temuan aktif/);
      const audit = await prisma.auditLog.count({ where: { action: "DESTINATION_FINDING_RETRACTED" } });
      expect(audit).toBeGreaterThanOrEqual(1);
    });
  });
  it("koreksi menolak klon dari konfirmasi bukti (tinjauan lama tidak menghidupkan kembali status klon)", async () => {
    await withMode("DEMO", async () => {
      const app = await createApplication(form({ ...base, journalUrl: "https://aktif-1b-klon.example" }), u.student, u.student.id);
      const fnd = (await activeFindings(app.journalId!)).active.find((x) => x.host === "aktif-1b-klon.example");
      if (fnd) { await retractFinding({ findingId: fnd.id, rationale: "Daftar rujukan keliru; domain ini sah menurut penerbit.", sourceUrl: "https://example.org/penerbit", actor: u.head }); }
      const { reassessApplicationJournal } = await import("@/lib/services/applications");
      await reassessApplicationJournal(app.id, u.reviewer);
      const ev = await evaluateApplication(await prisma.application.findUniqueOrThrow({ where: { id: app.id } }));
      expect(ev.journal!.destinationStatus).not.toBe("RED");
      expect(ev.journal!.destinationStatus).toBe("YELLOW"); // belum terverifikasi, bukan dianggap otentik
    });
  });
});

describe("7. riwayat validasi tetap terkait versi bukti & kebijakan", () => {
  const src = [{ label: "Sumber uji terkendali", ref: "dokumen-uji" }];
  it("referensi wajib sebelum proses; proses mengunci snapshot; revisi referensi dan proses ulang menjaga riwayat", async () => {
    await withMode("DEMO", async () => {
      const c = await createCase({ category: "GENUINE_VERIFIED", title: "Jurnal 1B Aktif (FIKTIF)", issn: "9901-0011", submittedUrl: "https://aktif-1b.example", authenticUrl: "https://aktif-1b.example", stage: "PRE_SUBMISSION", isFictionalFixture: true, sources: src, notes: null, pseudonym: "S-1", applicationId: null } as any, u.reviewer);
      await expect(runCase(c.id, u.reviewer)).rejects.toThrow(/referensi manual/);
      await expect(createCase({ category: "GENUINE_VERIFIED", title: "x", stage: "PRE_SUBMISSION" } as any, u.student)).rejects.toThrow(/peninjau/);
      await expect(recordReference(c.id, { journalStatus: "GREEN", destinationStatus: "GREEN", adminStatus: "GREEN", finalStatus: "GREEN", rationale: "pendek", assessedAt: "2026-10-01", sources: src }, u.reviewer)).rejects.toThrow();
      await expect(recordReference(c.id, { journalStatus: "GREEN", destinationStatus: "GREEN", adminStatus: "GREEN", finalStatus: "GREEN", rationale: "Referensi manual lengkap dan beralasan.", assessedAt: "2026-10-01", sources: [] }, u.reviewer)).rejects.toThrow();
      await recordReference(c.id, { journalStatus: "GREEN", destinationStatus: "GREEN", adminStatus: "GREEN", finalStatus: "GREEN", rationale: "Referensi manual lengkap dan beralasan.", assessedAt: "2026-10-01", sources: src }, u.reviewer);
      const run1 = await runCase(c.id, u.reviewer);
      expect(run1.agreement).toBe("AGREE");
      expect(run1.policyVersion).toBeGreaterThanOrEqual(1);
      expect(run1.policyHash).toHaveLength(16);
      expect(JSON.parse(run1.evidenceSnapshotJson).length).toBeGreaterThan(3);
      expect(run1.appVersion).toMatch(/engine 1B/);
      // kebijakan berubah → proses baru memakai versi baru; proses lama TIDAK berubah
      const p0 = await getActivePolicy();
      await publishPolicy(u.admin, { name: "v-uji-validasi", config: { ...p0.config, maxIndexEvidenceAgeDays: 5 }, isDemo: true, note: "uji" });
      const run2 = await runCase(c.id, u.reviewer);
      expect(run2.policyVersion).toBe(p0.version + 1);
      expect(run2.policyHash).not.toBe(run1.policyHash);
      expect(run2.agreement).toBe("DISAGREE"); // bukti 10 hari > batas 5 hari → KUNING
      expect(run2.safetyCritical).toBe(false); // aplikasi lebih KETAT, bukan longgar
      const reread = await prisma.validationRun.findUniqueOrThrow({ where: { id: run1.id } });
      expect(reread.policyVersion).toBe(run1.policyVersion);
      expect(reread.evidenceSnapshotJson).toBe(run1.evidenceSnapshotJson);
      await expect(classifyRun(run2.id, { discrepancyClass: "XX", note: "catatan cukup panjang" }, u.reviewer)).rejects.toThrow(ValidationError);
      await classifyRun(run2.id, { discrepancyClass: "POLICY_DIFFERENCE", note: "Batas umur bukti kebijakan uji lebih ketat.", correctiveAction: "Atur ulang kebijakan" }, u.reviewer);
      await publishPolicy(u.admin, { name: "kembali", config: p0.config, isDemo: true, note: "reset uji" });
      const retest = await runCase(c.id, u.reviewer, { retestOfRunId: run2.id });
      expect(retest.retestOutcome).toBe("RESOLVED");
      expect(await prisma.validationRun.count({ where: { caseId: c.id } })).toBe(3);
      // ekspor: tanpa narasi secara bawaan, aman dari formula-injection, satu baris per proses
      const csv = await exportCsv(u.reviewer, false);
      expect(csv.split("\n").filter((l) => l.includes(c.caseCode))).toHaveLength(3);
      expect(csv).not.toContain("Referensi manual lengkap dan beralasan.");
      expect(csv).toContain("FIKTIF");
      await expect(exportCsv(u.reviewer, true)).rejects.toThrow(/Kepala/);
      expect(await exportCsv(u.head, true)).toContain("Referensi manual lengkap dan beralasan.");
      await expect(exportCsv(u.student as any, false)).rejects.toThrow();
    });
  });
  it("kasus fiktif ditolak pada PILOT; kerangka cakupan kosong tidak mengarang hasil dan tidak mengisi cakupan nyata", async () => {
    await expect(withMode("PILOT", () => createCase({ category: "CONFIRMED_CLONE", title: "Kasus fiktif", stage: "PRE_SUBMISSION", isFictionalFixture: true, sources: [] } as any, u.reviewer))).rejects.toThrow(/PILOT/);
    const n = await createCoverageShells(u.reviewer);
    expect(n).toBe(10);
    expect(await createCoverageShells(u.reviewer)).toBe(0); // idempoten
    const shells = await prisma.validationCase.findMany({ where: { title: { startsWith: "[ISI KASUS NYATA]" } } });
    expect(shells).toHaveLength(10);
    expect(shells.every((s) => s.status === "AWAITING_MANUAL_REFERENCE")).toBe(true);
    await expect(runCase(shells[0].id, u.reviewer)).rejects.toThrow();
    const cov = await coverageSummary();
    expect(cov.every((c) => c.realRun === 0 && c.realAgree === 0)).toBe(true); // tidak ada klaim validasi nyata
    expect(cov.find((c) => c.code === "GENUINE_VERIFIED")!.fictionalFixtures).toBeGreaterThanOrEqual(1);
  });
  it("ekspor CSV menetralkan formula-injection", async () => {
    const c = await createCase({ category: "CONFIRMED_CLONE", title: "=HYPERLINK(\"http://x\")", stage: "PRE_SUBMISSION", sources: [], isFictionalFixture: true } as any, u.reviewer);
    expect(await exportCsv(u.reviewer, false)).toContain(`"'=HYPERLINK(""http://x"")"`);
    await prisma.validationCase.delete({ where: { id: c.id } });
  });
});

describe("impor Scopus: validasi struktur, tanggal pengamatan, versi, dan kebijakan impor lama/baru", () => {
  const ok = (rows: any) => rows as Record<string, string>[];
  it("menolak: tanpa kolom status, tanpa identifier, tanpa tanggal pengamatan, tanggal masa depan, ISSN rusak > 5%", () => {
    const base = [{ "Source Title": "A", "Print-ISSN": "9901-0011", "Active or Inactive": "Active" }];
    expect(validateImport("SCOPUS_SOURCE_LIST", ok(base), { sourceDate: D(1) }).errors).toEqual([]);
    expect(validateImport("SCOPUS_SOURCE_LIST", ok([{ "Source Title": "A", "Print-ISSN": "9901-0011" }]), { sourceDate: D(1) }).errors.join()).toMatch(/status/);
    expect(validateImport("SCOPUS_SOURCE_LIST", ok([{ "Source Title": "A", "Active or Inactive": "Active" }]), { sourceDate: D(1) }).errors.join()).toMatch(/identifier/);
    expect(validateImport("SCOPUS_SOURCE_LIST", ok(base), {}).errors.join()).toMatch(/pengamatan/);
    expect(validateImport("SCOPUS_SOURCE_LIST", ok(base), { sourceDate: new Date(Date.now() + 10 * 86_400_000) }).errors.join()).toMatch(/masa depan/);
    expect(validateImport("SCOPUS_SOURCE_LIST", ok([{ "Source Title": "A", "Print-ISSN": "1234-5678", "Active or Inactive": "Active" }]), { sourceDate: D(1) }).errors.join()).toMatch(/ISSN tidak valid/);
  });
  it("impor lama dipertahankan; impor terbaru menggantikan (bukan konflik); riwayat dicatat", async () => {
    await withMode("DEMO", async () => {
      const mk = (status: string) => `Source Title,Print-ISSN,E-ISSN,Active or Inactive,Publisher's Name,Sourceid\nJurnal Impor Ganda 1B (FIKTIF),9901-0046,,${status},Penerbit 1B,9901004\n`;
      const old = await importDataset({ kind: "SCOPUS_SOURCE_LIST", buffer: Buffer.from(mk("Active")), filename: "o.csv", versionLabel: "lama", provenance: "fiktif", sourceDate: D(60), isComplete: true, isDemo: true, actor: u.admin });
      const neu = await importDataset({ kind: "SCOPUS_SOURCE_LIST", buffer: Buffer.from(mk("Inactive")), filename: "n.csv", versionLabel: "baru", provenance: "fiktif", sourceDate: D(5), isComplete: true, isDemo: true, actor: u.admin });
      expect(await prisma.referenceDataset.count({ where: { id: { in: [old.id, neu.id] } } })).toBe(2); // keduanya dipertahankan
      expect(JSON.parse(neu.validationJson).rowCount).toBe(1);
      const r = await runInvestigation({ identity: { title: "Jurnal Impor Ganda 1B (FIKTIF)", altTitles: [], issn: "9901-0046", subjects: [], claimedIndexing: [], submittedWebsite: null }, actor: u.reviewer });
      expect(r.decision.indexingStatus).toBe("DISCONTINUED_VERIFIED"); // impor terbaru berlaku, bukan CONFLICTED
      const a = await loadAssessment(r.assessmentId);
      expect(a!.evidence.some((e) => e.key === "scopus.import_history")).toBe(true);
      expect(await prisma.auditLog.count({ where: { action: "DATASET_IMPORTED", entityId: neu.id } })).toBe(1);
    });
  });
  it("impor lama yang usang tidak menghasilkan HIJAU (umur bukti melewati batas kebijakan)", async () => {
    await withMode("DEMO", async () => {
      const csv = `Source Title,Print-ISSN,E-ISSN,Active or Inactive,Publisher's Name,Sourceid\nJurnal Usang 1B (FIKTIF),9901-0054,,Active,Penerbit 1B,9901005\n`;
      await importDataset({ kind: "SCOPUS_SOURCE_LIST", buffer: Buffer.from(csv), filename: "u.csv", versionLabel: "usang", provenance: "fiktif", sourceDate: D(900), isComplete: true, isDemo: true, actor: u.admin });
      const r = await runInvestigation({ identity: { title: "Jurnal Usang 1B (FIKTIF)", altTitles: [], issn: "9901-0054", subjects: [], claimedIndexing: [], submittedWebsite: null }, actor: u.reviewer });
      expect(r.decision.indexingStatus).toBe("OUTDATED_EVIDENCE");
      expect(r.decision.journalStatus).toBe("YELLOW");
    });
  });
});

describe("6. akses tanpa wewenang", () => {
  it("siswa/admin/peninjau tidak dapat APPROVE; siswa tidak dapat mengelola validasi atau temuan", async () => {
    const app = await createApplication(form({ ...base, journalUrl: "https://aktif-1b.example" }), u.student, u.student.id);
    for (const actor of [u.student, u.admin, u.reviewer]) await expect(performReviewAction({ applicationId: app.id, actor, action: "APPROVE", rationale: "Percobaan menyetujui tanpa wewenang." })).rejects.toThrow(/tidak berwenang/);
    await setChecklist(app.id, "OTHER" as any, "MET", null, u.reviewer);
  });
});
