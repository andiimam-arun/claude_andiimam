import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { importDataset, validateImport } from "@/lib/services/reference";
import { lookupDoajImported } from "@/lib/services/externalSources";
import { makeUsers, type U } from "./helpers";

// Fixture FIKTIF berformat CSV DOAJ (kolom persis seperti https://doaj.org/csv). ISSN: checksum sah, unik untuk berkas ini.
const HEAD = "Journal title,Journal URL,URL in DOAJ,Alternative title,Journal ISSN (print version),Journal EISSN (online version),Publisher,Country of publisher,APC,APC amount,Journal license,Added on Date,Last updated Date\n";
const csv = (rows: string[]) => Buffer.from(HEAD + rows.join("\n") + "\n");
const R1 = '"Jurnal Fiktif Uji A",https://jurnal-a.example.org,https://doaj.org/toc/fiktifa,,1234-5679,2345-6787,Penerbit Fiktif A,Indonesia,No,,CC BY,2020-01-01,2026-09-01';
const R2 = '"Jurnal Fiktif Uji B",https://jurnal-b.example.org,https://doaj.org/toc/fiktifb,,3456-7895,,Penerbit Fiktif B,Indonesia,Yes,500 USD,CC BY-NC,2021-02-02,2026-09-02';

let actor: U;
beforeAll(async () => { actor = (await makeUsers("doajimp")).admin; });

const base = (buffer: Buffer, over: Record<string, any> = {}) => ({ kind: "DOAJ_LIST" as const, buffer, filename: "doaj-uji.csv", versionLabel: "DOAJ uji", provenance: "fixture uji", sourceDate: new Date("2026-11-01"), isComplete: true, isDemo: true, actor, ...over });

describe("impor CSV DOAJ", () => {
  it("kolom DOAJ dikenali; baris tanpa ISSN valid/tanpa tanggal ditolak", () => {
    const rows = [{ "Journal title": "X", "Journal ISSN (print version)": "1234-5679", "Journal EISSN (online version)": "", Publisher: "P", "Journal URL": "https://x.example" }];
    const v = validateImport("DOAJ_LIST", rows, { sourceDate: new Date("2026-11-01") });
    expect(v.errors).toEqual([]);
    expect(v.columns).toMatchObject({ title: "Journal title", issn: "Journal ISSN (print version)", eissn: "Journal EISSN (online version)", url: "Journal URL" });
    expect(validateImport("DOAJ_LIST", rows, {}).errors.join(" ")).toMatch(/Tanggal pengamatan/);
    expect(validateImport("DOAJ_LIST", [{ Title: "X", Foo: "1" }], { sourceDate: new Date() }).errors.join(" ")).toMatch(/ISSN/);
  });

  it("impor menyimpan record; pencarian ISSN cetak/online → VERIFIED + IMPORTED_DATA (bukan LIVE), beranda jadi pembanding domain lemah", async () => {
    const ds = await importDataset(base(csv([R1, R2])));
    expect(ds.rowCount).toBe(2);
    const r = await lookupDoajImported("2345-6787", null, true); // cocok lewat E-ISSN
    expect(r!.evidence[0]).toMatchObject({ key: "metadata.doaj", status: "VERIFIED", integration: "IMPORTED_DATA" });
    expect(r!.evidence[0].sourceName).toContain("DOAJ uji");
    expect(r!.evidence[0].sourceName).not.toMatch(/LIVE/i);
    expect(r!.evidence[0].sourceDataDate).toContain("2026-11-01");
    expect(r!.evidence[1]).toMatchObject({ key: "identity.official_domain", strength: "WEAK", integration: "IMPORTED_DATA" });
    expect(r!.info).toMatchObject({ found: true, title: "Jurnal Fiktif Uji A", apc: false });
    const b = await lookupDoajImported("3456-7895", null, false);
    expect(b!.info).toMatchObject({ found: true, apc: true });
  });

  it("tidak ada pada impor → NOT_FOUND tidak konklusif (INFO/WEAK), bukan bukti negatif, walau jurnal mengklaim DOAJ", async () => {
    const r = await lookupDoajImported("0028-0836", null, true);
    expect(r!.evidence).toHaveLength(1);
    expect(r!.evidence[0]).toMatchObject({ status: "NOT_FOUND", integration: "IMPORTED_DATA", severity: "INFO", strength: "WEAK" });
    expect(r!.evidence[0].explanation).toMatch(/bukan bukti negatif|Bukan bukti negatif/i);
  });

  it("tanpa impor aktif → null (tidak mengarang apa pun)", async () => {
    await prisma.referenceDataset.updateMany({ where: { kind: "DOAJ_LIST" }, data: { active: false } });
    expect(await lookupDoajImported("1234-5679", null, false)).toBeNull();
  });

  it("impor lengkap baru menggantikan yang lama (lama dinonaktifkan, riwayat tetap)", async () => {
    const a = await importDataset(base(csv([R1]), { versionLabel: "DOAJ uji v1" }));
    const b = await importDataset(base(csv([R2]), { versionLabel: "DOAJ uji v2" }));
    const act = await prisma.referenceDataset.findMany({ where: { kind: "DOAJ_LIST", active: true } });
    expect(act.map((d) => d.id)).toEqual([b.id]);
    expect(await prisma.referenceDataset.findUnique({ where: { id: a.id } })).toBeTruthy();
    expect((await lookupDoajImported("1234-5679", null, false))!.info!.found).toBe(false); // R1 hanya ada di v1
  });
});

describe("investigasi memakai impor DOAJ hanya bila DOAJ langsung tidak tersedia", () => {
  it("DOAJ langsung dinonaktifkan + impor ada → bukti metadata.doaj berasal dari IMPORTED_DATA, tersimpan pada penilaian", async () => {
    await importDataset(base(csv([R1, R2]), { versionLabel: "DOAJ uji alur" }));
    const { runInvestigation, loadAssessment } = await import("@/lib/services/investigation");
    const r = await runInvestigation({ identity: { title: "Jurnal Fiktif Uji A", altTitles: [], issn: "1234-5679", subjects: [], claimedIndexing: ["DOAJ"], submittedWebsite: "https://jurnal-a.example.org" }, actor, isDemo: true });
    const a: any = await loadAssessment(r.assessmentId);
    const ev = (a.evidence ?? a.evidenceRecords ?? []).filter((e: any) => e.key === "metadata.doaj");
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ status: "VERIFIED", integration: "IMPORTED_DATA" });
  });
});
