import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const PW = "demo-journal-detective";
const BASE = "http://localhost:3100";

async function login(page: Page, email: string, pw = PW) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/localhost:3100\/$/);
}
const logout = async (page: Page) => { await page.getByRole("button", { name: /Keluar|Sign out/ }).click(); await expect(page).toHaveURL(/login/); };
const cookieHeader = async (page: Page) => (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

async function makePdf(path: string) {
  const d = await PDFDocument.create();
  const p = d.addPage();
  const f = await d.embedFont(StandardFonts.Helvetica);
  p.drawText("[DOKUMEN FIKTIF] Submission acknowledgment", { x: 50, y: 740, size: 12, font: f });
  p.drawText("Manuscript ID: AUD-2026-001", { x: 50, y: 720, size: 12, font: f });
  p.drawText("Title: Studi Audit Penerimaan Fase Satu Fiktif", { x: 50, y: 700, size: 12, font: f });
  p.drawText("Journal: Jurnal Audit E2E (FIKTIF)  ISSN 9900-0067", { x: 50, y: 680, size: 12, font: f });
  const bytes = Buffer.from(await d.save());
  writeFileSync(path, bytes);
  return bytes;
}

test.describe.serial("audit penerimaan Fase 1 — alur lengkap", () => {
  let appUrl = "";
  let docHref = "";
  let docSha = "";

  test("1. investigasi → KUNING (tanpa bukti), lalu bukti manual → penilaian ulang → HIJAU", async ({ page }) => {
    await login(page, "peninjau@jd.example");
    await page.goto("/investigations/new");
    await page.fill('input[name="title"]', "Jurnal Audit E2E (FIKTIF)");
    await page.fill('input[name="issn"]', "9900-0067");
    await page.fill('input[name="publisher"]', "Penerbit Audit (FIKTIF)");
    await page.fill('input[name="claimedIndexing"]', "Scopus");
    await page.fill('input[name="submittedWebsite"]', "https://audit-e2e.example");
    await page.getByRole("button", { name: "Jalankan Investigasi" }).click();
    await expect(page.getByText("PERLU INVESTIGASI").first()).toBeVisible();
    await expect(page.getByText("BELUM TERVERIFIKASI").first()).toBeVisible(); // Scopus tanpa bukti
    const invUrl = page.url().split("?")[0];

    // VERIFIED tanpa sumber ditolak
    await page.selectOption('select[name="kind"]', "scopus.coverage");
    await page.fill('input[name="finding"]', "Aktif");
    await page.fill('input[name="sourceName"]', "Scopus Sources");
    await page.getByRole("button", { name: "Catat bukti manual" }).click();
    await expect(page.getByText(/wajib mencantumkan URL sumber/)).toBeVisible();

    const add = async (kind: string, fields: Record<string, string>) => {
      await page.goto(invUrl);
      await page.selectOption('select[name="kind"]', kind);
      for (const [k, v] of Object.entries(fields)) await page.fill(`[name="${k}"]`, v);
      await page.getByRole("button", { name: "Catat bukti manual" }).click();
      await expect(page.getByText("Bukti manual dicatat")).toBeVisible();
    };
    await add("scopus.coverage", { finding: "Aktif menurut Scopus Sources (cek manual fiktif)", sourceName: "Scopus Sources (simulasi uji FIKTIF)", sourceUrl: "https://www.scopus.com/sources", sourceDataDate: new Date().toISOString().slice(0, 10) });
    await add("identity.official_domain", { domains: "https://audit-e2e.example", finding: "Situs resmi menurut penerbit (FIKTIF)", sourceName: "Halaman penerbit fiktif", sourceUrl: "https://penerbit-audit.example/jurnal" });
    await add("identity.corroboration", { finding: "ISSN dan judul cocok pada halaman penerbit (FIKTIF)", sourceName: "Halaman penerbit fiktif", sourceUrl: "https://penerbit-audit.example/jurnal" });

    await page.goto(invUrl);
    await page.getByRole("button", { name: "Nilai ulang" }).click();
    await expect(page.getByText("Penilaian ulang selesai")).toBeVisible();
    await expect(page.getByText("TERVERIFIKASI").first()).toBeVisible();
    await expect(page.getByText("Bukti manual").first()).toBeVisible(); // basis berlabel
    await expect(page.getByText("PERLU INVESTIGASI")).toHaveCount(0);
  });

  test("2. mahasiswa mengajukan dengan PDF sungguhan; peninjau memeriksa ekstraksi, daftar periksa, merekomendasikan", async ({ page }) => {
    const bytes = await makePdf("/tmp/audit-ack.pdf");
    docSha = createHash("sha256").update(bytes).digest("hex");
    await login(page, "mahasiswa@jd.example");
    await page.goto("/applications/new");
    await page.fill('input[name="supervisor"]', "Prof. Pembimbing (FIKTIF)");
    await page.fill('input[name="manuscriptTitle"]', "Studi Audit Penerimaan Fase Satu Fiktif");
    await page.fill('input[name="researchField"]', "Kesehatan");
    await page.selectOption('select[name="stage"]', "SUBMITTED");
    await page.fill('input[name="submissionDate"]', "2026-08-01");
    await page.fill('input[name="journalName"]', "Jurnal Audit E2E (FIKTIF)");
    await page.fill('input[name="journalIssn"]', "9900-0067");
    await page.fill('input[name="claimedIndexing"]', "Scopus");
    await page.fill('input[name="journalUrl"]', "https://audit-e2e.example");
    await page.selectOption('select[name="docType"]', "SUBMISSION_ACK");
    await page.setInputFiles('input[type="file"]', "/tmp/audit-ack.pdf");
    await page.getByRole("button", { name: "Kirim permohonan" }).click();
    await expect(page.getByText("Permohonan dibuat")).toBeVisible();
    appUrl = page.url().split("?")[0];
    docHref = (await page.getByRole("link", { name: /Unduh/ }).first().getAttribute("href"))!;
    expect(docHref).toMatch(/^\/api\/documents\//);
    // mahasiswa tidak melihat bukti rinci jurnal; administratif KUNING (dokumen belum diverifikasi)
    await expect(page.getByText("Tambah bukti manual")).toHaveCount(0);
    await logout(page);

    await login(page, "peninjau@jd.example");
    await page.goto(appUrl);
    await expect(page.getByText("ekstraksi belum ditinjau")).toBeVisible();
    await page.getByText("Periksa / koreksi hasil ekstraksi").click();
    await expect(page.locator('input[name="manuscriptId"]')).toHaveValue("AUD-2026-001");
    await expect(page.locator('input[name="issns"]')).toHaveValue("9900-0067");
    await page.fill('input[name="manuscriptId"]', "AUD-2026-001");
    await page.getByRole("button", { name: /Simpan koreksi/ }).click();
    await expect(page.getByText("ditandai telah ditinjau")).toBeVisible();
    await expect(page.getByText("ekstraksi ditinjau")).toBeVisible();
    // klirens administratif masih KUNING sampai daftar periksa diverifikasi
    await expect(page.getByText("PERLU BUKTI / KLARIFIKASI").first()).toBeVisible();
    const row = page.locator("#daftar-bukti form").first();
    await row.locator('select[name="status"]').selectOption("MET");
    await row.getByRole("button", { name: "OK" }).click();
    await expect(page.getByText("Daftar periksa diperbarui")).toBeVisible();
    await page.selectOption('select[name="action"]', "RECOMMEND_APPROVE");
    await page.fill('textarea[name="rationale"]', "Jurnal terverifikasi (bukti manual) dan tanda terima valid.");
    await page.getByRole("button", { name: "Catat tindakan" }).click();
    await expect(page.getByText("Tindakan peninjauan dicatat")).toBeVisible();
  });

  test("3. kontrol akses dokumen rahasia", async ({ page, browser }) => {
    // pengguna anonim
    const anon = await browser.newContext();
    const r0 = await anon.request.get(BASE + docHref, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401]).toContain(r0.status());
    await anon.close();
    // administrator membuat mahasiswa kedua
    await login(page, "admin@jd.example");
    await page.goto("/settings");
    await page.locator('input[name="name"]').last().fill("Mahasiswa Lain (FIKTIF)");
    await page.fill('input[name="email"]', "lain@jd.example");
    await page.fill('input[name="password"]', "kata-sandi-uji-12345");
    await page.selectOption('select[name="role"]', "STUDENT");
    await page.getByRole("button", { name: "Tambah pengguna" }).click();
    await expect(page.getByText("Pengguna dibuat")).toBeVisible();
    // administrator tidak boleh membaca dokumen mahasiswa
    const rAdmin = await page.request.get(BASE + docHref, { headers: { cookie: await cookieHeader(page) }, maxRedirects: 0 });
    expect(rAdmin.status()).toBe(403);
    await logout(page);
    // mahasiswa lain
    await login(page, "lain@jd.example", "kata-sandi-uji-12345");
    const rOther = await page.request.get(BASE + docHref, { headers: { cookie: await cookieHeader(page) }, maxRedirects: 0 });
    expect(rOther.status()).toBe(403);
    await page.goto(appUrl);
    await expect(page.getByText("Studi Audit Penerimaan Fase Satu Fiktif")).toHaveCount(0); // 404 untuk permohonan orang lain
    await expect(page.getByText(/could not be found|tidak ditemukan/i).first()).toBeVisible();
    await logout(page);
    // pemilik & peninjau berhasil, byte identik
    for (const email of ["mahasiswa@jd.example", "peninjau@jd.example"]) {
      await login(page, email);
      const r = await page.request.get(BASE + docHref, { headers: { cookie: await cookieHeader(page) } });
      expect(r.status()).toBe(200);
      expect(r.headers()["content-disposition"]).toContain("attachment");
      expect(createHash("sha256").update(await r.body()).digest("hex")).toBe(docSha);
      await logout(page);
    }
  });

  test("4. keputusan Kepala Unit → Journal Passport & riwayat penilaian dapat dibuka kembali", async ({ page }) => {
    await login(page, "kepala@jd.example");
    await page.goto(appUrl);
    await page.selectOption('select[name="action"]', "APPROVE");
    await page.fill('textarea[name="rationale"]', "Disetujui setelah bukti ditinjau.");
    await page.getByRole("button", { name: "Catat tindakan" }).click();
    await expect(page.getByText("Tindakan peninjauan dicatat")).toBeVisible();
    await expect(page.getByText("Disetujui").first()).toBeVisible();
    // permohonan final terkunci: tidak ada formulir unggah / aksi lagi
    await expect(page.getByRole("button", { name: "Unggah" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Catat tindakan" })).toHaveCount(0);
    await page.goto("/journals?q=9900-0067");
    await expect(page.getByRole("link", { name: "Jurnal Audit E2E (FIKTIF)" })).toBeVisible();
    await expect(page.getByText("FIKTIF").first()).toBeVisible();
    await page.getByRole("link", { name: "Jurnal Audit E2E (FIKTIF)" }).click();
    await expect(page.getByText("Riwayat penilaian & indeksasi")).toBeVisible();
    await expect(page.getByText("Jadwal validasi ulang")).toBeVisible();
    await page.goto("/assessments?q=9900-0067");
    const rows = await page.locator("tbody tr").count();
    expect(rows).toBeGreaterThanOrEqual(3); // investigasi awal, penilaian ulang, penilaian saat persetujuan, penilaian permohonan
    await expect(page.locator("tbody").getByText("KUNING").first()).toBeVisible();
    await expect(page.locator("tbody").getByText("HIJAU").first()).toBeVisible();
  });
});
