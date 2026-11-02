import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { classifyQuery, detectHeaderRow, detectSheetRole, issnKey, mapHeader, mergeScopus, parseCoverage } from "@/lib/engine/scopusImport";
import { cancelImport, confirmImport, readWorkbook, searchScopus, stageImport, ScopusImportError } from "@/lib/services/scopusReference";
import { loadAssessment, runInvestigation } from "@/lib/services/investigation";
import { createApplication, evaluateApplication } from "@/lib/services/applications";
import { getActivePolicy, publishPolicy } from "@/lib/services/policyService";
import { SR, writeScopusFixture } from "../helpers/scopusFixture";
import { makeUsers, form, type U } from "./helpers";

let u: { admin: U; reviewer: U; head: U; student: U };
let dir: string;
beforeAll(async () => { u = await makeUsers("scp"); dir = mkdtempSync(path.join(tmpdir(), "scopus-")); });
afterAll(async () => { await prisma.scopusImport.deleteMany(); rmSync(dir, { recursive: true, force: true }); });

const stage = (file: string, over: Partial<Parameters<typeof stageImport>[0]> = {}) =>
  stageImport({ filePath: file, fileName: path.basename(file), versionLabel: "September 2026", observationDate: "2026-09-01", sourceUrl: "https://downloads.example/ext_list_Sep_2026.xlsx", actor: u.admin, ...over });

describe("deteksi header & peran sheet berdasarkan nama kolom (murni)", () => {
  const hdr = ["Sourcerecord ID", "Source Title", "Print-ISSN", "E-ISSN", "Active or Inactive", "Coverage", "Publisher's Name"];
  it("header di baris 1, 2, dan 3 (dengan baris pembuka) terdeteksi", () => {
    expect(detectHeaderRow([hdr, ["1", "A"]])!.rowIndex).toBe(0);
    expect(detectHeaderRow([["Judul laporan"], hdr, ["1", "A"]])!.rowIndex).toBe(1);
    expect(detectHeaderRow([["Judul laporan"], ["catatan"], hdr, ["1", "A"]])!.rowIndex).toBe(2);
  });
  it("urutan kolom bebas, kolom asing diabaikan, nama kolom varian dikenali", () => {
    const d = detectHeaderRow([["Foo", "Online ISSN", "Source Title", "Active/Inactive", "Publisher imprints grouped to main Publisher", "All Science Journal Classification Codes (ASJC)"]])!;
    expect(d.mapping).toMatchObject({ eissn: 1, title: 2, active: 3, publisherGroup: 4, asjc: 5 });
    expect(d.mapping.issn).toBeUndefined();
    expect(mapHeader("Titles Discontinued by Scopus due to quality issues")).toBe("discQuality");
    expect(mapHeader("Final Coverage Year")).toBe("finalYear");
    expect(mapHeader("Final Coverage Pages")).toBe("finalPages");
    expect(mapHeader("Indexation Change")).toBe("indexationChange");
    expect(mapHeader("Kolom Aneh")).toBeNull();
  });
  it("peran sheet: dari nama (pembaruan bulan lain tetap dikenali) atau dari kolom", () => {
    expect(detectSheetRole("Scopus Sources Dec. 2026", { title: 0 })).toBe("SOURCES");
    expect(detectSheetRole("Discontinued Titles Dec. 2026", { title: 0 })).toBe("DISCONTINUED");
    expect(detectSheetRole("Accepted Titles Dec. 2026", { title: 0 })).toBe("ACCEPTED");
    expect(detectSheetRole("Lembar1", { title: 0, finalYear: 1 })).toBe("DISCONTINUED");
    expect(detectSheetRole("Lembar2", { title: 0, active: 1 })).toBe("SOURCES");
    expect(detectSheetRole("Lembar3", { title: 0, issn: 1 })).toBeNull();
  });
  it("identifier sebagai teks: nol depan & X dipertahankan; ISSN tanpa/dengan tanda hubung", () => {
    expect(issnKey("0000-0019")).toMatchObject({ key: "00000019", display: "0000-0019" });
    expect(issnKey("00000019").key).toBe("00000019");
    expect(issnKey("0000006X").key).toBe("0000006X");
    expect(issnKey("0000-006x").key).toBe("0000006X");
    expect(issnKey("19")).toMatchObject({ key: "00000019", warning: "ZERO_PADDED" }); // sel numerik kehilangan nol → dipulihkan hanya bila checksum sah
    expect(issnKey("12345678").key).toBeNull(); // checksum tidak sah
    expect(classifyQuery("2045-2322")).toEqual({ kind: "ISSN", value: "20452322" });
    expect(classifyQuery("20452322")).toEqual({ kind: "ISSN", value: "20452322" });
    expect(classifyQuery("0000-006x")).toEqual({ kind: "ISSN", value: "0000006X" });
    expect(classifyQuery("21100200805")).toEqual({ kind: "SOURCE_ID", value: "21100200805" });
    expect(classifyQuery("Scientific Reports").kind).toBe("TITLE");
    expect(parseCoverage("2011-2026")).toEqual({ from: 2011, to: 2026 });
    expect(parseCoverage("2001-2005, 2008-2020")).toEqual({ from: 2001, to: 2020 });
  });
});

describe("pratinjau → konfirmasi workbook sintetis (3 sheet, header baris 1/2/3)", () => {
  let file: string, previewId: string;
  it("pratinjau tidak menulis record referensi dan TIDAK membuat Journal Passport; metadata asal-usul tersimpan", async () => {
    file = path.join(dir, "ext_list_Sep_2026.xlsx");
    await writeScopusFixture(file);
    const journalsBefore = await prisma.journal.count();
    const imp = await stage(file);
    previewId = imp.id;
    expect(imp.status).toBe("PREVIEW");
    expect(await prisma.scopusSource.count({ where: { importId: imp.id } })).toBe(0);
    expect(await prisma.journal.count()).toBe(journalsBefore);
    expect(imp.sha256).toBe(createHash("sha256").update(readFileSync(file)).digest("hex"));
    expect(imp).toMatchObject({ fileName: "ext_list_Sep_2026.xlsx", versionLabel: "September 2026", sourceUrl: "https://downloads.example/ext_list_Sep_2026.xlsx", importedByName: u.admin.name });
    const sum = JSON.parse(imp.summaryJson);
    expect(sum.sheets.map((s: any) => [s.role, s.headerRow])).toEqual([["SOURCES", 1], ["DISCONTINUED", 2], ["ACCEPTED", 3]]);
    expect(sum.ignoredSheets.map((s: any) => s.name)).toEqual(["About"]);
    expect(sum.totals).toMatchObject({ sources: 8, duplicates: 1, errors: 1, discontinuedRows: 3, discontinuedMatched: 2, discontinuedStandalone: 1, acceptedRows: 1, acceptedStandalone: 1 });
    expect(sum.conflictsByType).toMatchObject({ ACTIVE_BUT_DISCONTINUED: 1, DUPLICATE_SOURCE_ID_DIFFERENT: 1 });
    expect(sum.sheets[0].unmappedHeaders).toContain("Kolom Tambahan Tak Dikenal");
    expect(sum.qualityFlagValues).toEqual({ Discontinued: 1 });
  });
  it("konfirmasi menyimpan record; impor menjadi terkini; Journal Passport tetap TIDAK dibuat", async () => {
    const journalsBefore = await prisma.journal.count();
    const imp = await confirmImport(previewId, u.admin);
    expect(imp).toMatchObject({ status: "CONFIRMED", isCurrent: true });
    expect(await prisma.scopusSource.count({ where: { importId: imp.id } })).toBe(10);
    expect(await prisma.journal.count()).toBe(journalsBefore);
    await expect(confirmImport(previewId, u.admin)).rejects.toThrow(/PRATINJAU/);
  });
  it("Scientific Reports: pencarian nama, ISSN dengan/tanpa tanda hubung, dan Source ID menemukan record yang SAMA; kedua kolom ISSN", async () => {
    const ids = new Set<string>();
    for (const q of ["Scientific Reports", "scientific reports", "scientific rep", "2045-2322", "20452322", "21100200805"]) {
      const r = await searchScopus(q);
      expect(r.results.length, q).toBeGreaterThan(0);
      ids.add(r.results[0].id);
      expect(r.results[0].sourceId, q).toBe(SR.sourceId);
    }
    expect(ids.size).toBe(1);
    const rec = await prisma.scopusSource.findFirstOrThrow({ where: { sourceId: SR.sourceId } });
    expect(rec).toMatchObject({ eissn: "20452322", issn: null, status: "ACTIVE", coverage: "2011-2026", coverageFrom: 2011, coverageTo: 2026, publisher: "Nature Research", publisherGroup: "Springer Nature", sourceType: "Journal", eissnRaw: "20452322" });
    expect(rec.asjc).toContain("1000");
    // ISSN cetak ditemukan pada kolom Print-ISSN, e-ISSN pada kolom E-ISSN; kueri ISSN mencari keduanya
    expect((await searchScopus("0000-0019")).results[0].title).toMatch(/Nol Depan/);
    expect((await searchScopus("0000-006x")).results[0].title).toMatch(/Huruf X/); // huruf X dipertahankan
    expect((await searchScopus("00000027")).results[0].title).toMatch(/Numerik/);  // sel numerik dipulihkan
    expect((await searchScopus("jurnal tidak ada sama sekali")).results).toEqual([]);
  });
  it("Inactive ≠ dihentikan karena kualitas; data penghentian akhir (tahun/volume/issue/halaman) dan Indexation Change dipertahankan", async () => {
    const plain = await prisma.scopusSource.findFirstOrThrow({ where: { sourceId: "9902000004" } });
    const quality = await prisma.scopusSource.findFirstOrThrow({ where: { sourceId: "9902000005" } });
    expect([plain.status, plain.discontinuedQuality]).toEqual(["INACTIVE", false]);
    expect([quality.status, quality.discontinuedQuality]).toEqual(["INACTIVE", true]);
    expect(JSON.parse(quality.discontinuedJson!)).toMatchObject({ indexationChange: "Discontinued - quality", finalYear: 2020, finalVolume: "12", finalIssue: "4", finalPages: "1-20" });
    const conflict = await prisma.scopusSource.findFirstOrThrow({ where: { sourceId: "9902000006" } });
    expect(JSON.parse(conflict.conflictsJson).map((c: any) => c.type)).toContain("ACTIVE_BUT_DISCONTINUED");
    const standalone = await prisma.scopusSource.findFirstOrThrow({ where: { title: { contains: "Hanya Di Daftar" } } });
    expect([standalone.origin, standalone.status, standalone.sourceId]).toEqual(["DISCONTINUED", "INACTIVE", null]);
  });
  it("Accepted Titles = status tersendiri, bukan aktif", async () => {
    const acc = await prisma.scopusSource.findFirstOrThrow({ where: { origin: "ACCEPTED" } });
    expect(acc.status).toBe("ACCEPTED");
    expect(acc.eissn).toBe("00001023");
  });
  it("impor kedua menggantikan yang pertama; yang lama DIPERTAHANKAN; penilaian lama tidak disentuh", async () => {
    const r0 = await runInvestigation({ identity: { title: "Scientific Reports", altTitles: [], eissn: "2045-2322", subjects: [], claimedIndexing: [], submittedWebsite: null }, actor: u.reviewer });
    const f2 = path.join(dir, "ext_list_Okt_2026.xlsx");
    await writeScopusFixture(f2, { reorderColumns: true });
    const prev = await stage(f2, { versionLabel: "Oktober 2026", observationDate: "2026-10-01" });
    // urutan kolom dibalik tetap terpetakan sama
    const sum = JSON.parse(prev.summaryJson);
    expect(sum.totals.sources).toBe(8);
    const imp2 = await confirmImport(prev.id, u.admin);
    const all = await prisma.scopusImport.findMany({ orderBy: { uploadedAt: "asc" } });
    expect(all.map((i) => [i.versionLabel, i.status, i.isCurrent])).toEqual([["September 2026", "SUPERSEDED", false], ["Oktober 2026", "CONFIRMED", true]]);
    expect(await prisma.scopusSource.count({ where: { importId: all[0].id } })).toBe(10); // riwayat tetap utuh
    expect((await searchScopus("2045-2322")).import!.id).toBe(imp2.id);
    expect(await prisma.assessment.findUnique({ where: { id: r0.assessmentId } })).not.toBeNull();
  });
  it("pembatalan pratinjau: tidak ada data tersimpan", async () => {
    const f3 = path.join(dir, "ext_list_batal.xlsx");
    await writeScopusFixture(f3);
    const p = await stage(f3, { versionLabel: "Batal" });
    await cancelImport(p.id, u.admin);
    expect(await prisma.scopusSource.count({ where: { importId: p.id } })).toBe(0);
    expect(existsSync(p.stagedPath!)).toBe(false);
    expect((await prisma.scopusImport.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CANCELLED");
  });
  it("berkas rusak/tanpa Sources/tanggal tidak sah ditolak dengan pesan jelas", async () => {
    const bad = path.join(dir, "bad.xlsx");
    (await import("node:fs")).writeFileSync(bad, "bukan zip");
    await expect(stage(bad)).rejects.toBeInstanceOf(ScopusImportError);
    await expect(stage(file, { observationDate: "2999-01-01" })).rejects.toThrow(/masa depan/);
    await expect(stage(file, { versionLabel: " " })).rejects.toThrow(/versi/i);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(); wb.addWorksheet("Lain").addRow(["x", "y"]);
    const noSrc = path.join(dir, "nosrc.xlsx"); await wb.xlsx.writeFile(noSrc);
    await expect(stage(noSrc)).rejects.toThrow(/Sources tidak ditemukan/);
  });
  it("berkas besar (3.000 baris tambahan) dibaca streaming dalam waktu wajar", async () => {
    const big = path.join(dir, "big.xlsx");
    await writeScopusFixture(big, { extraRows: 3000 });
    const t0 = Date.now();
    const p = await readWorkbook(big);
    const m = mergeScopus(p.sheets);
    expect(m.summary.totals.sources).toBe(3008);
    expect(Date.now() - t0).toBeLessThan(15_000);
  });
});

describe("integrasi dengan investigasi: berdasarkan impor, bukan verifikasi langsung", () => {
  let importId: string;
  beforeAll(async () => {
    await prisma.scopusImport.deleteMany();
    const f = path.join(dir, "ext_inv.xlsx");
    await writeScopusFixture(f);
    importId = (await confirmImport((await stage(f)).id, u.admin)).id;
  });
  const inv = (identity: any) => runInvestigation({ identity: { altTitles: [], subjects: [], claimedIndexing: [], submittedWebsite: null, ...identity }, actor: u.reviewer });

  it("Scientific Reports: ACTIVE dari impor, berlabel versi + IMPORTED_DATA; TIDAK membuktikan situs autentik atau klirens akhir", async () => {
    const r = await inv({ title: "Scientific Reports", eissn: "2045-2322", publisher: "Springer Nature", claimedIndexing: ["Scopus"], submittedWebsite: "https://situs-tak-dikenal.example" });
    expect(r.decision.indexingStatus).toBe("ACTIVE_VERIFIED");
    expect(r.decision.indexingBasis).toBe("IMPORTED_DATA");
    const a = (await loadAssessment(r.assessmentId))!;
    const ev = a.evidence.find((e) => e.key === "scopus.coverage")!;
    expect(ev.finding).toContain("Berdasarkan impor Scopus September 2026");
    expect(ev.finding).toContain("bukan verifikasi langsung");
    expect(ev.integration).toBe("IMPORTED_DATA");
    expect(ev.sourceName).toContain("September 2026");
    expect(ev.sourceDataDate?.slice(0, 10)).toBe("2026-09-01");
    expect(ev.data).toMatchObject({ coverage: "ACTIVE", sourceId: SR.sourceId, publisher: "Nature Research", publisherGroup: "Springer Nature", coverageFrom: 2011, coverageTo: 2026 });
    expect(a.evidence.some((e) => e.key === "identity.corroboration")).toBe(true);
    expect(a.evidence.some((e) => e.key === "identity.publisher_mismatch")).toBe(false); // grup penerbit dikenali
    // pilar 9: indeksasi dari impor ≠ situs autentik ≠ klirens akhir
    expect(r.decision.destinationStatus).not.toBe("GREEN");
    expect(r.decision.websiteStatus).not.toBe("AUTHENTIC");
    const app = await createApplication(form({ journalName: "Scientific Reports", journalIssn: "2045-2322", claimedIndexing: "Scopus", journalUrl: "https://situs-tak-dikenal.example" }), u.student, u.student.id);
    const ev2 = await evaluateApplication(app);
    expect(ev2.journal!.indexingStatus).toBe("ACTIVE_VERIFIED");
    expect(ev2.final!.status).not.toBe("GREEN");
  });
  it("Journal Passport dibuat SAAT diperiksa, hanya untuk jurnal yang diperiksa", async () => {
    const journals = await prisma.journal.count({ where: { title: "Scientific Reports" } });
    expect(journals).toBe(1);
    expect(await prisma.scopusSource.count({ where: { importId } })).toBe(10);
    expect(await prisma.journal.count({ where: { title: { contains: "Jurnal Massal" } } })).toBe(0);
  });
  it("tidak ditemukan dalam impor = BELUM TERVERIFIKASI (bukan tidak terindeks)", async () => {
    const r = await inv({ title: "Jurnal Yang Tidak Ada Di Impor", issn: "9903-0010" });
    expect(r.decision.indexingStatus).toBe("NOT_LISTED_INCONCLUSIVE");
    expect(r.decision.journalStatus).toBe("YELLOW");
    const e = (await loadAssessment(r.assessmentId))!.evidence.find((x) => x.key === "scopus.coverage")!;
    expect(e).toMatchObject({ status: "NOT_FOUND", integration: "IMPORTED_DATA" });
    expect(e.finding).toMatch(/belum terverifikasi.*bukan berarti tidak terindeks/i);
    expect(e.data.conclusive).toBe(false);
  });
  it("Inactive tanpa penanda kualitas → DISCONTINUED_VERIFIED + alasan 'bukan masalah kualitas'; dengan penanda → alasan kualitas dari sumber", async () => {
    const plain = await inv({ title: "Jurnal Inaktif Tanpa Daftar (FIKTIF)", issn: "0000-0035" });
    expect(plain.decision.indexingStatus).toBe("DISCONTINUED_VERIFIED");
    expect(plain.decision.reasons.map((r) => r.code)).toContain("scopus_inactive_not_quality");
    expect(plain.decision.reasons.map((r) => r.code)).not.toContain("scopus_discontinued_quality");
    expect(plain.decision.predatoryAssessment).not.toBe("CONFIRMED_VIOLATION");
    const q = await inv({ title: "Jurnal Dihentikan Kualitas (FIKTIF)", issn: "0000-0043" });
    expect(q.decision.reasons.map((r) => r.code)).toContain("scopus_discontinued_quality");
    const ev = (await loadAssessment(q.assessmentId))!.evidence.find((x) => x.key === "scopus.coverage")!;
    expect(ev.data).toMatchObject({ discontinuedForQuality: true, coverageTo: 2020, finalCoverage: { year: 2020, volume: "12", issue: "4", pages: "1-20", indexationChange: "Discontinued - quality" } });
  });
  it("konflik data → bukti KONFLIK (perlu tinjauan), indeksasi tidak dianggap terverifikasi", async () => {
    const r = await inv({ title: "Jurnal Aktif Tapi Dihentikan (FIKTIF)", issn: "0000-0051" });
    expect(r.decision.indexingStatus).toBe("CONFLICTED");
    expect(r.decision.journalStatus).toBe("YELLOW");
    const e = (await loadAssessment(r.assessmentId))!.evidence.find((x) => x.key === "scopus.coverage")!;
    expect(e.status).toBe("CONFLICTED");
    expect(e.requiresHumanConfirmation).toBe(true);
    expect(e.data.conflictTypes).toContain("ACTIVE_BUT_DISCONTINUED");
  });
  it("Accepted Titles: status tersendiri, BUKAN aktif; kebijakan yang mewajibkan Scopus aktif → belum terpenuhi", async () => {
    const r = await inv({ title: "Jurnal Diterima Baru (FIKTIF)", eissn: "0000-1023" });
    expect(r.decision.indexingStatus).toBe("ACCEPTED_PENDING");
    expect(r.decision.indexingStatus).not.toBe("ACTIVE_VERIFIED");
    expect(r.decision.policyEligibility).toBe("UNDETERMINED");
    expect(r.decision.journalStatus).toBe("YELLOW");
    expect(r.decision.reasons.map((x) => x.code)).toContain("scopus_accepted_pending");
  });
  it("pencarian ISSN cetak/e-ISSN: kueri e-ISSN menemukan juga jurnal yang diperiksa lewat ISSN cetak, dan sebaliknya", async () => {
    const a = await inv({ title: "Judul Berbeda Sama Sekali", issn: "2045-2322" }); // e-ISSN Scientific Reports diberikan pada kolom ISSN
    expect(a.decision.indexingStatus).toBe("ACTIVE_VERIFIED"); // kedua kolom dicari
  });
  it("kebijakan lama/baru tetap berlaku: impor September melewati batas umur bukti → KUNING (usang), bukan HIJAU", async () => {
    const p0 = await getActivePolicy();
    await publishPolicy(u.admin, { name: "umur-pendek-uji", config: { ...p0.config, maxIndexEvidenceAgeDays: 10 }, isDemo: true, note: "uji" });
    const r = await inv({ title: "Scientific Reports", eissn: "2045-2322" });
    expect(r.decision.indexingStatus).toBe("OUTDATED_EVIDENCE");
    await publishPolicy(u.admin, { name: "kembali", config: p0.config, isDemo: true, note: "reset uji" });
  });
});
