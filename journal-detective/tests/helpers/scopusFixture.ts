import ExcelJS from "exceljs";

/**
 * Workbook SINTETIS menyerupai struktur "ext_list" Scopus (3 sheet dengan header di baris 1/2/3 + sheet 'About' yang diabaikan).
 * BUKAN salinan workbook asli. Judul fiktif berlabel (FIKTIF); satu baris (Scientific Reports) memakai nilai yang diberikan pengguna
 * untuk pengujian pencarian, dan hanya ada pada fixture uji ini.
 */
export const SR = { sourceId: "21100200805", eissn: "20452322", title: "Scientific Reports", publisher: "Nature Research", group: "Springer Nature", coverage: "2011-2026" };

export async function writeScopusFixture(path: string, opts: { reorderColumns?: boolean; extraRows?: number } = {}) {
  const wb = new ExcelJS.Workbook();
  const about = wb.addWorksheet("About");
  about.addRow(["Sintetis: fixture uji Journal Detective (bukan workbook asli)"]);

  const srcHeaders = ["Sourcerecord ID", "Source Title", "Print-ISSN", "E-ISSN", "Active or Inactive", "Titles Discontinued by Scopus due to quality issues", "Coverage", "Source Type", "Publisher's Name", "Publisher imprints grouped to main Publisher", "Publisher Country", "Open Access status", "All Science Journal Classification Codes (ASJC)", "Kolom Tambahan Tak Dikenal"];
  const order = opts.reorderColumns ? [...srcHeaders.keys()].reverse() : [...srcHeaders.keys()];
  const put = (ws: ExcelJS.Worksheet, row: Array<string | number | null>) => ws.addRow(order.map((i) => row[i] ?? null));
  const s1 = wb.addWorksheet("Scopus Sources Sep. 2026");
  put(s1, srcHeaders);
  const R = (id: string | number | null, title: string, p: string | number | null, e: string | number | null, st: string, q: string | null, cov: string, type: string, pub: string, grp: string | null, ctry: string, asjc: string) =>
    [id, title, p, e, st, q, cov, type, pub, grp, ctry, "Open Access", asjc, "x"];
  put(s1, R(SR.sourceId, SR.title, null, SR.eissn, "Active", null, SR.coverage, "Journal", SR.publisher, SR.group, "United Kingdom", "1000; 1100; 1300"));
  put(s1, R("9902000001", "Jurnal Nol Depan Teks (FIKTIF)", "00000019", null, "Active", null, "2015-2026", "Journal", "Penerbit Fiktif", null, "Indonesia", "2700"));
  put(s1, R("9902000002", "Jurnal ISSN Numerik (FIKTIF)", 27, null, "Active", null, "2018-2026", "Journal", "Penerbit Fiktif", null, "Indonesia", "2700"));
  put(s1, R(9902000003 as unknown as string, "Jurnal Huruf X (FIKTIF)", "0000006X", null, "Active", null, "2010-2026", "Journal", "Penerbit Fiktif", null, "Indonesia", "1300"));
  put(s1, R("9902000004", "Jurnal Inaktif Tanpa Daftar (FIKTIF)", "00000035", null, "Inactive", null, "2005-2015", "Journal", "Penerbit Fiktif", null, "Indonesia", "1300"));
  put(s1, R("9902000005", "Jurnal Dihentikan Kualitas (FIKTIF)", "00000043", null, "Inactive", "Discontinued", "2012-2020", "Journal", "Penerbit Fiktif", null, "Indonesia", "1300"));
  put(s1, R("9902000006", "Jurnal Aktif Tapi Dihentikan (FIKTIF)", "00000051", null, "Active", null, "2012-2026", "Journal", "Penerbit Fiktif", null, "Indonesia", "1300"));
  put(s1, R("9902000007", "Jurnal Judul Kosong Ganda (FIKTIF)", "00000078", null, "Active", null, "2012-2026", "Journal", "Penerbit Fiktif", null, "Indonesia", "1300"));
  put(s1, R("9902000007", "Jurnal Judul Kosong Ganda (FIKTIF)", "00000078", null, "Inactive", null, "2012-2019", "Journal", "Penerbit Fiktif", null, "Indonesia", "1300")); // duplikat Source ID, status berbeda
  put(s1, R("9902000008", "", "00000086", null, "Active", null, "2012-2026", "Journal", "Penerbit Fiktif", null, "Indonesia", "1300")); // judul kosong → galat
  for (let i = 0; i < (opts.extraRows ?? 0); i++) put(s1, R(`98${String(i).padStart(9, "0")}`, `Jurnal Massal ${i} (FIKTIF)`, null, null, i % 3 === 0 ? "Inactive" : "Active", null, "2000-2020", "Journal", "Penerbit Fiktif", null, "Indonesia", "1300"));

  const s2 = wb.addWorksheet("Discontinued Titles Sep. 2026");
  s2.addRow(["Daftar judul yang dihentikan — Sep. 2026 (sintetis)"]);
  s2.addRow(["Sourcerecord ID", "Source Title", "Print-ISSN", "E-ISSN", "Publisher", "Indexation Change", "Final Coverage Year", "Final Coverage Volume", "Final Coverage Issue", "Final Coverage Pages"]);
  s2.addRow(["9902000005", "Jurnal Dihentikan Kualitas (FIKTIF)", "00000043", null, "Penerbit Fiktif", "Discontinued - quality", 2020, "12", "4", "1-20"]);
  s2.addRow(["9902000006", "Jurnal Aktif Tapi Dihentikan (FIKTIF)", "00000051", null, "Penerbit Fiktif", "Discontinued - publisher request", 2024, "9", "2", "30-44"]);
  s2.addRow([null, "Jurnal Hanya Di Daftar Dihentikan (FIKTIF)", "00000094", null, "Penerbit Fiktif", "Discontinued", 2016, "3", "1", "1-9"]);

  const s3 = wb.addWorksheet("Accepted Titles Sep. 2026");
  s3.addRow(["Judul diterima untuk ditambahkan (sintetis)"]);
  s3.addRow(["Catatan: belum otomatis aktif terindeks"]);
  s3.addRow(["Source Title", "Print-ISSN", "E-ISSN", "Publisher's Name", "Accepted Date"]);
  s3.addRow(["Jurnal Diterima Baru (FIKTIF)", null, "00001023", "Penerbit Fiktif", "2026-08-15"]);
  await wb.xlsx.writeFile(path);
}
