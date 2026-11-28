import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { tmpdir } from "node:os";
import { writeScopusFixture } from "../helpers/scopusFixture";

const PW = "demo-journal-detective";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/localhost:3100\/$/);
}
const logout = async (page: Page) => { await page.getByRole("button", { name: /Keluar|Sign out/ }).click(); await expect(page).toHaveURL(/login/); };

test.describe.serial("impor database referensi Scopus lewat UI", () => {
  const file = path.join(tmpdir(), `ext_list_e2e_${process.pid}.xlsx`);

  test("peninjau tidak melihat formulir impor; administrator mengunggah → pratinjau → konfirmasi", async ({ page }) => {
    await writeScopusFixture(file);
    await login(page, "peninjau@jd.example");
    await page.getByRole("link", { name: "Database Scopus" }).click();
    await expect(page.getByText("Belum ada impor").first()).toBeVisible();
    await expect(page.getByText("Langkah 1")).toHaveCount(0);
    await logout(page);

    await login(page, "admin@jd.example");
    await page.getByRole("link", { name: "Database Scopus" }).click();
    await expect(page.getByText("Langkah 1 — Unggah workbook Scopus")).toBeVisible();
    await expect(page.locator('input[name="versionLabel"]')).toHaveValue("September 2026");
    await page.setInputFiles('input[name="file"]', file);
    await page.getByRole("button", { name: "Unggah & buat pratinjau" }).click();
    await expect(page.getByText("Langkah 2 — Pratinjau impor (belum disimpan)")).toBeVisible({ timeout: 60000 });
    // pratinjau: sheet/header terdeteksi, hitungan, konflik, kesalahan — sebelum konfirmasi
    await expect(page.getByRole("cell", { name: "Scopus Sources Sep. 2026" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Discontinued Titles Sep. 2026" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Accepted Titles Sep. 2026" })).toBeVisible();
    await expect(page.getByText("diabaikan").first()).toBeVisible();
    await expect(page.getByText("ACTIVE_BUT_DISCONTINUED").first()).toBeVisible();
    await expect(page.getByText(/baris \d+: Judul kosong/)).toBeVisible();
    await expect(page.getByText("Baris valid (Sources)")).toBeVisible();
    await expect(page.getByText(/sha-256/i).first()).toBeVisible();
    // belum ada hasil pencarian sebelum konfirmasi
    await page.getByRole("button", { name: "Konfirmasi & simpan impor" }).click();
    await expect(page.getByText("Impor dikonfirmasi")).toBeVisible({ timeout: 60000 });
    await expect(page.getByText("September 2026").first()).toBeVisible();
    await expect(page.getByText("terkini").first()).toBeVisible();
  });

  test("pencarian Scientific Reports dan 2045-2322 menemukan record yang sama; detail menampilkan grup penerbit", async ({ page }) => {
    await login(page, "peninjau@jd.example");
    await page.goto("/sources/scopus?q=Scientific%20Reports");
    const hrefA = await page.getByRole("link", { name: "Scientific Reports", exact: true }).first().getAttribute("href");
    await page.goto("/sources/scopus?q=2045-2322");
    const hrefB = await page.getByRole("link", { name: "Scientific Reports", exact: true }).first().getAttribute("href");
    expect(hrefA).toBeTruthy();
    expect(hrefB).toBe(hrefA);
    await expect(page.getByText(/Berdasarkan impor September 2026.*bukan verifikasi langsung/)).toBeVisible();
    await page.goto("/sources/scopus?q=20452322");
    await expect(page.getByRole("link", { name: "Scientific Reports", exact: true })).toBeVisible();
    await page.goto(hrefA!);
    await expect(page.getByText("Springer Nature")).toBeVisible();
    await expect(page.getByText("Nature Research")).toBeVisible();
    await expect(page.getByText("21100200805")).toBeVisible();
    await page.goto("/sources/scopus?q=tidak%20ada%20jurnal%20begini");
    await expect(page.getByText(/belum terverifikasi \(bukan berarti tidak terindeks\)/)).toBeVisible();
  });

  test("autocomplete pada Investigasi Jurnal Baru mengisi identitas; Passport dibuat saat diperiksa", async ({ page }) => {
    await login(page, "peninjau@jd.example");
    await page.goto("/investigations/new");
    await page.locator('input[name="title"]').fill("Scientific Rep");
    const opt = page.getByRole("option").filter({ hasText: "Scientific Reports" }).first();
    await expect(opt).toBeVisible({ timeout: 15000 });
    await opt.click();
    await expect(page.locator('input[name="title"]')).toHaveValue("Scientific Reports");
    await expect(page.locator('input[name="eissn"]')).toHaveValue("2045-2322");
    await expect(page.locator('input[name="scopusSourceId"]')).toHaveValue("21100200805");
    await expect(page.locator('input[name="publisher"]')).toHaveValue("Nature Research");
    await expect(page.getByRole("status").filter({ hasText: "Berdasarkan impor Scopus September 2026" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "BUKAN verifikasi langsung" })).toBeVisible();
    // pencarian dengan ISSN tanpa tanda hubung
    await page.locator('input[name="issn"]').fill("");
    await page.locator('input[name="issn"]').fill("00000019");
    await expect(page.getByRole("option").filter({ hasText: "Nol Depan" })).toBeVisible({ timeout: 15000 });
    await page.locator('input[name="title"]').fill("Scientific Reports");
    await page.locator('input[name="issn"]').fill("");
    await page.locator('input[name="submittedWebsite"]').fill("https://situs-uji-tak-dikenal.example");
    await page.getByRole("button", { name: "Jalankan Investigasi" }).click();
    await expect(page.getByRole("heading", { name: "Scientific Reports" })).toBeVisible();
    await expect(page.getByText(/Berdasarkan impor Scopus September 2026/).first()).toBeVisible();
    // indeksasi dari impor tidak membuktikan tujuan autentik
    await expect(page.locator("div.rounded-xl.border-2", { hasText: "Status Tujuan Pengiriman" }).getByText("KUNING")).toBeVisible();
    await page.goto("/journals?q=2045-2322");
    await expect(page.getByRole("link", { name: "Scientific Reports" })).toBeVisible();
    await page.goto("/journals?q=Jurnal%20Massal");
    await expect(page.getByText("Belum ada jurnal.")).toBeVisible();
  });

  test("tidak ditemukan pada impor ditampilkan sebagai belum terverifikasi", async ({ page }) => {
    await login(page, "peninjau@jd.example");
    await page.goto("/investigations/new");
    await page.locator('input[name="title"]').fill("Jurnal Yang Pasti Tidak Ada Xyz");
    await expect(page.getByText(/belum terverifikasi \(bukan berarti tidak terindeks\)/)).toBeVisible({ timeout: 15000 });
  });
});
