import { expect, test, type Page } from "@playwright/test";

const PW = "demo-journal-detective";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/localhost:3100\/$/);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: /Keluar|Sign out/ }).click();
  await expect(page).toHaveURL(/login/);
}

test("akses tanpa login dialihkan ke /login", async ({ page }) => {
  await page.goto("/journals");
  await expect(page).toHaveURL(/login/);
});

test("login gagal menampilkan galat", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "kepala@jd.example");
  await page.fill('input[name="password"]', "salah-salah");
  await page.click('button[type="submit"]');
  await expect(page.getByText("Email atau kata sandi salah.")).toBeVisible();
});

test("dashboard staf menampilkan widget, banner kebijakan demo, dan bahasa dapat diganti", async ({ page }) => {
  await login(page, "peninjau@jd.example");
  await expect(page.getByText("KEBIJAKAN DEMONSTRASI").first()).toBeVisible();
  await expect(page.getByText("Total jurnal diinvestigasi")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aktivitas investigasi terbaru" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("Total journals investigated")).toBeVisible();
});

test("kasus klon: persetujuan Kepala Unit diblokir dan surat resmi tidak dapat terbit", async ({ page }) => {
  await login(page, "kepala@jd.example");
  await page.goto("/applications");
  await page.getByRole("link", { name: "PK-2026-0003" }).click();
  await expect(page.getByText("Peringatan keamanan").first()).toBeVisible();
  await expect(page.getByText("KLIRENS DIBLOKIR").first()).toBeVisible();
  await page.selectOption('select[name="action"]', "APPROVE");
  await page.fill('textarea[name="rationale"]', "Mencoba menyetujui meski situs klon, seharusnya ditolak sistem.");
  await page.getByRole("button", { name: "Catat tindakan" }).click();
  await expect(page.getByRole("status").first()).toBeVisible().catch(() => undefined);
  await expect(page.getByRole("alert").filter({ hasText: /diblokir/ }).first()).toBeVisible();
});

test("alur hijau: mahasiswa mengajukan, peninjau merekomendasikan, administrator hanya draf, Kepala menyetujui dan menerbitkan, verifikasi QR", async ({ page, request }) => {
  // Mahasiswa mengajukan permohonan pra-pengiriman
  await login(page, "mahasiswa@jd.example");
  await page.goto("/applications/new");
  await page.fill('input[name="studentName"]', "Mahasiswa Contoh (FIKTIF)");
  await page.fill('input[name="supervisor"]', "Prof. Pembimbing (FIKTIF)");
  await page.fill('input[name="manuscriptTitle"]', "Studi Uji E2E Tentang Gizi Anak Fiktif");
  await page.fill('input[name="researchField"]', "Kesehatan Masyarakat");
  await page.fill('input[name="journalName"]', "Jurnal Riset Kesehatan Nusantara (FIKTIF)");
  await page.fill('input[name="journalIssn"]', "9900-0016");
  await page.fill('input[name="claimedIndexing"]', "Scopus");
  await page.fill('input[name="journalUrl"]', "https://jurnal-riset-kesehatan.example");
  await page.getByRole("button", { name: "Kirim permohonan" }).click();
  await expect(page.getByText("Permohonan dibuat")).toBeVisible();
  await expect(page.getByText("Status Integritas Jurnal")).toBeVisible();
  const appUrl = page.url().split("?")[0];
  // mahasiswa tidak melihat evidence rinci jurnal
  await expect(page.getByText("Tambah bukti manual")).toHaveCount(0);
  await logout(page);

  // Peninjau merekomendasikan
  await login(page, "peninjau@jd.example");
  await page.goto(appUrl);
  await page.selectOption('select[name="action"]', "RECOMMEND_APPROVE");
  await page.fill('textarea[name="rationale"]', "Jurnal terverifikasi dan situs cocok domain resmi.");
  await page.getByRole("button", { name: "Catat tindakan" }).click();
  await expect(page.getByText("Tindakan peninjauan dicatat")).toBeVisible();
  // Peninjau tidak melihat opsi APPROVE
  await expect(page.locator('select[name="action"] option[value="APPROVE"]')).toHaveCount(0);
  // draf surat berwatermark
  await page.getByRole("button", { name: /Buat draf: Klirens pra-pengiriman/ }).click();
  await expect(page.getByText("DRAF — BELUM DISETUJUI").first()).toBeAttached();
  const draftUrl = page.url().split("?")[0];
  await logout(page);

  // Administrator: hanya draf, tidak bisa menerbitkan
  await login(page, "admin@jd.example");
  await page.goto(draftUrl);
  await expect(page.getByText(/penerbitan resmi diblokir|Official issuance is blocked/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /terbitkan surat resmi/i })).toHaveCount(0);
  await logout(page);

  // Kepala Unit menyetujui lalu menerbitkan
  await login(page, "kepala@jd.example");
  await page.goto(appUrl);
  await page.selectOption('select[name="action"]', "APPROVE");
  await page.fill('textarea[name="rationale"]', "Disetujui: seluruh bukti memuaskan.");
  await page.getByRole("button", { name: "Catat tindakan" }).click();
  await expect(page.getByText("Tindakan peninjauan dicatat")).toBeVisible();
  await page.goto(draftUrl);
  await page.fill('input[name="officialNumber"]', "E2E-UJI/0001");
  await page.getByRole("button", { name: /Setujui & terbitkan surat resmi/ }).click();
  await expect(page.getByText("Surat resmi diterbitkan")).toBeVisible();
  await expect(page.getByText("Nomor: E2E-UJI/0001")).toBeVisible();
  const verifyPath = (await page.locator("p.font-mono").first().innerText()).replace("http://localhost:3100", "");
  // PDF dapat diunduh
  const pdfPath = draftUrl.replace("http://localhost:3100", "") + "/pdf";
  const cookies = await page.context().cookies();
  const res = await request.get(`http://localhost:3100/api${pdfPath.replace("/letters", "/letters")}`, { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
  // Halaman verifikasi publik (tanpa login)
  const anon = await page.context().browser()!.newContext();
  const p2 = await anon.newPage();
  await p2.goto(`http://localhost:3100${verifyPath}`);
  await expect(p2.getByRole("heading", { name: /Surat sah/ })).toBeVisible();
  await expect(p2.getByText("E2E-UJI/0001")).toBeVisible();
  await expect(p2.getByText("Mahasiswa Contoh")).toHaveCount(0); // nama dimasking
  await anon.close();
});

test("halaman verifikasi dengan kode tak dikenal", async ({ page }) => {
  await page.goto("/verify/kode-tidak-ada");
  await expect(page.getByText(/tidak ditemukan/i).first()).toBeVisible();
});

test("investigasi jurnal baru tanpa data rujukan: Scopus UNVERIFIED dan tidak ada HIJAU palsu", async ({ page }) => {
  await login(page, "peninjau@jd.example");
  await page.goto("/investigations/new");
  await page.fill('input[name="title"]', "Jurnal Uji Tanpa Rujukan E2E");
  await page.fill('input[name="issn"]', "9900-0059");
  await page.fill('input[name="claimedIndexing"]', "Scopus");
  await page.fill('input[name="submittedWebsite"]', "https://uji-e2e.example");
  await page.getByRole("button", { name: "Jalankan Investigasi" }).click();
  await expect(page.getByRole("heading", { name: "Jurnal Uji Tanpa Rujukan E2E" })).toBeVisible();
  await expect(page.getByText("PERLU INVESTIGASI").first()).toBeVisible();
  await expect(page.getByText("Alasan penilaian")).toBeVisible();
  await expect(page.getByText("Situs otentik vs situs yang diajukan")).toBeVisible();
  // laporan PDF
  const link = page.getByRole("link", { name: /Unduh laporan/ });
  const href = await link.getAttribute("href");
  const cookies = await page.context().cookies();
  const res = await page.request.get(`http://localhost:3100${href}`, { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } });
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("mahasiswa tidak dapat membuka halaman staf maupun permohonan orang lain", async ({ page }) => {
  await login(page, "mahasiswa@jd.example");
  await page.goto("/settings");
  await expect(page).toHaveURL(/error=forbidden|\/$/);
  await page.goto("/journals");
  await expect(page).toHaveURL(/error=forbidden|\/$/);
});

test("Journal Passport dan Riwayat Penilaian dapat dicari, ada jadwal validasi ulang", async ({ page }) => {
  await login(page, "peninjau@jd.example");
  await page.getByRole("link", { name: "Journal Passport" }).click();
  await expect(page.getByText("Validasi ulang").first()).toBeVisible();
  await page.fill('input[name="q"]', "9900-0016");
  await page.getByRole("button", { name: "Cari" }).click();
  await expect(page.getByRole("link", { name: /Jurnal Riset Kesehatan Nusantara/ }).first()).toBeVisible();
  await page.getByRole("link", { name: "Riwayat Penilaian" }).click();
  await page.fill('input[name="q"]', "jurnal-riset-kesehatam");
  await page.getByRole("button", { name: "Cari" }).click();
  await expect(page.getByText("jurnal-riset-kesehatam.example")).toBeVisible();
  await page.selectOption('select[name="status"]', "RED");
  await page.fill('input[name="q"]', "");
  await page.getByRole("button", { name: "Cari" }).click();
  await expect(page.getByText("klon/identitas palsu").first()).toBeVisible();
});
