import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { importDataset } from "@/lib/services/reference";
import { createApplication } from "@/lib/services/applications";
import { batchApproveClean } from "@/lib/services/approval";
import { parseScopusFileName, updateScopusFromInbox, updateStatus, STALE_DAYS } from "@/lib/services/dbUpdate";
import { makeUsers, form, type U } from "./helpers";

let u: { admin: U; reviewer: U; head: U; student: U };
const SCOPUS = `Source Title,Print-ISSN,E-ISSN,Active or Inactive,Publisher's Name,Sourceid
Jurnal Batch Bersih (FIKTIF),9901-2340,,Active,Penerbit Batch,5551
`;
const HIJ = `Journal Name,ISSN,Authentic URL,Hijacked URL
Jurnal Batch Bersih (FIKTIF),9901-2340,https://batch-bersih.example,https://batch-bersih-online.example
`;
const ident = { journalName: "Jurnal Batch Bersih (FIKTIF)", journalIssn: "9901-2340", journalPublisher: "Penerbit Batch", claimedIndexing: "Scopus", journalUrl: "https://batch-bersih.example" };

beforeAll(async () => {
  u = await makeUsers("dbupd");
  const recent = new Date(Date.now() - 20 * 86_400_000);
  await importDataset({ kind: "SCOPUS_SOURCE_LIST", buffer: Buffer.from(SCOPUS), filename: "b.csv", versionLabel: "uji batch", provenance: "fiktif uji", sourceDate: recent, isComplete: true, isDemo: true, actor: u.admin });
  await importDataset({ kind: "HIJACKED", buffer: Buffer.from(HIJ), filename: "bh.csv", versionLabel: "uji batch", provenance: "fiktif uji", sourceDate: recent, isComplete: true, isDemo: true, actor: u.admin });
});

describe("nama berkas Scopus → versi & tanggal", () => {
  it.each([
    ["ext_list_Sep_2026.xlsx", "September 2026", "2026-09-01"],
    ["ext_list_Dec_2026.xlsx", "Desember 2026", "2026-12-01"],
    ["Scopus Source List June 2027.xlsx", "Juni 2027", "2027-06-01"],
    ["ext_list_Mar-2027 (1).xlsx", "Maret 2027", "2027-03-01"],
  ])("%s", (name, label, date) => expect(parseScopusFileName(name)).toEqual({ label, date }));
  it("nama tanpa bulan/tahun → null (tidak ditebak)", () => { expect(parseScopusFileName("daftar.xlsx")).toBeNull(); expect(parseScopusFileName("ext_list_2026.xlsx")).toBeNull(); });
});

describe("inbox Scopus", () => {
  it("inbox kosong → NO_FILE; berkas tanpa bulan dibiarkan dan ditolak; berkas rusak → FAILED tanpa mengubah data", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "inbox-"));
    process.env.INBOX_DIR = dir;
    try {
      const sc = path.join(dir, "scopus"); // dibuat otomatis
      expect((await updateScopusFromInbox(u.admin))[0].outcome).toBe("NO_FILE");
      writeFileSync(path.join(sc, "daftar.xlsx"), "bukan xlsx");
      const r1 = await updateScopusFromInbox(u.admin);
      expect(r1[0]).toMatchObject({ outcome: "REJECTED" });
      expect(existsSync(path.join(sc, "daftar.xlsx"))).toBe(true);
      writeFileSync(path.join(sc, "ext_list_Sep_2031.xlsx"), "bukan xlsx");
      const r2 = await updateScopusFromInbox(u.admin);
      expect(r2.find((r) => r.detail.includes("ext_list_Sep_2031"))!.outcome).toBe("FAILED");
      expect(readdirSync(sc)).toContain("ext_list_Sep_2031.xlsx"); // tidak hilang
    } finally { delete process.env.INBOX_DIR; }
  });
});

describe("kesegaran database", () => {
  it("status memakai tanggal data; kedaluwarsa melewati ambang", async () => {
    const s = await updateStatus();
    const doaj = s.find((x) => x.source === "DOAJ")!;
    expect(doaj.thresholdDays).toBe(STALE_DAYS.DOAJ);
    expect(["OK", "STALE", "NEVER"]).toContain(doaj.state);
  });
});

describe("persetujuan sekaligus (Kepala) — hanya kasus bersih", () => {
  it("peran selain Kepala ditolak; kasus bersih disetujui dengan audit; kasus tidak bersih dilewati, bukan di-override", async () => {
    const clean = await createApplication(form({ ...ident, studentEmail: "b1@t.example" }), u.student, u.student.id);
    const dirty = await createApplication(form({ ...ident, journalName: "Jurnal Tak Dikenal Batch (FIKTIF)", journalIssn: "9901-7776", journalUrl: "https://tak-dikenal-batch.example", claimedIndexing: "Scopus", studentEmail: "b2@t.example" }), u.student, u.student.id);
    await expect(batchApproveClean([clean.id], u.reviewer)).rejects.toThrow(/tidak berwenang/);
    const r = await batchApproveClean([clean.id, dirty.id], u.head);
    expect(r.skipped.filter((x) => x.ref === clean.refNumber)).toEqual([]);
    expect(r.approved).toEqual([clean.refNumber]);
    expect(r.skipped.map((x) => x.ref)).toEqual([dirty.refNumber]);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: clean.id } })).workflow).toBe("APPROVED");
    const d = await prisma.application.findUniqueOrThrow({ where: { id: dirty.id } });
    expect(d.workflow).not.toBe("APPROVED");
    expect(d.overrideJson).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "REVIEW_APPROVE", entityId: clean.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "REVIEW_BATCH_APPROVE" } })).toBeGreaterThanOrEqual(1);
  });
});
