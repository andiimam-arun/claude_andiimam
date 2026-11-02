import { expect, test, type Page } from "@playwright/test";

const PW = "demo-journal-detective";
const BASE = "http://localhost:3100";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/localhost:3100\/$/);
}
const logout = async (page: Page) => { await page.getByRole("button", { name: /Keluar|Sign out/ }).click(); await expect(page).toHaveURL(/login/); };
const cookies = async (page: Page) => (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

test("lingkungan DEMO ditampilkan mencolok (login dan aplikasi)", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("LINGKUNGAN: DEMO")).toBeVisible();
  await login(page, "peninjau@jd.example");
  await expect(page.getByTestId("env-banner")).toContainText("DEMO");
  await expect(page.getByTestId("env-banner")).toContainText("FIKTIF");
});

test("empat dimensi terpisah: jurnal sah HIJAU, tujuan klon MERAH, permohonan MERAH dan diblokir", async ({ page }) => {
  await login(page, "kepala@jd.example");
  await page.goto("/applications");
  await page.getByRole("link", { name: "PK-2026-0003" }).click();
  const cards = page.locator("div.rounded-xl.border-2");
  await expect(cards).toHaveCount(5); // 4 kartu dimensi + peringatan keamanan
  await expect(page.getByText("Status Integritas Jurnal").first()).toBeVisible();
  await expect(page.getByText("Status Tujuan Pengiriman").first()).toBeVisible();
  await expect(page.locator("div.rounded-xl.border-2", { hasText: "Status Integritas Jurnal" }).getByText("HIJAU")).toBeVisible();
  await expect(page.locator("div.rounded-xl.border-2", { hasText: "Status Tujuan Pengiriman" }).getByText("MERAH")).toBeVisible();
  await expect(page.locator("div.rounded-xl.border-2", { hasText: "Rekomendasi Akhir" }).getByText("MERAH")).toBeVisible();
  // daftar permohonan memuat kolom Tujuan
  await page.goto("/applications");
  await expect(page.getByRole("columnheader", { name: "Tujuan" })).toBeVisible();
});

test("temuan klon tampil permanen di Journal Passport dengan riwayat dan proses koreksi terkontrol", async ({ page }) => {
  await login(page, "peninjau@jd.example");
  await page.goto("/journals?q=9900-0016");
  await page.getByRole("link", { name: /Jurnal Riset Kesehatan Nusantara/ }).first().click();
  await expect(page.getByText("Temuan tujuan pengiriman (host persis)")).toBeVisible();
  await expect(page.getByText("jurnal-riset-kesehatan-online.example").first()).toBeVisible();
  await expect(page.getByText("CLONE_CONFIRMED")).toBeVisible();
  // koreksi tanpa bukti ditolak
  await page.getByText("Koreksi temuan ini (proses terkontrol)").click();
  await page.fill('textarea[name="rationale"]', "Ternyata keliru: domain adalah migrasi resmi menurut penerbit.");
  await page.getByRole("button", { name: /Koreksi \(riwayat tetap tersimpan\)/ }).click();
  await expect(page.getByText(/bukti pendukung/)).toBeVisible();
  // koreksi dengan bukti diterima; riwayat dipertahankan
  await page.getByText("Koreksi temuan ini (proses terkontrol)").click();
  await page.fill('textarea[name="rationale"]', "Ternyata keliru: domain adalah migrasi resmi menurut penerbit.");
  await page.fill('input[name="sourceRef"]', "dokumen-uji-fiktif-001");
  await page.getByRole("button", { name: /Koreksi \(riwayat tetap tersimpan\)/ }).click();
  await expect(page.getByText("Temuan dikoreksi")).toBeVisible();
  await expect(page.getByText("RETRACTED")).toBeVisible();
  await expect(page.getByText("CLONE_CONFIRMED")).toBeVisible(); // riwayat tetap ada
});

test("mengubah tujuan pada permohonan membatalkan rekomendasi dan menilai ulang", async ({ page }) => {
  await login(page, "peninjau@jd.example");
  await page.goto("/applications");
  await page.getByRole("link", { name: "PK-2026-0001" }).click();
  await expect(page.getByText("RECOMMEND_APPROVE").first().or(page.getByText("Direkomendasikan — menunggu pejabat").first())).toBeVisible();
  await page.getByText(/Ubah jurnal \/ tujuan/).click();
  await page.fill('input[aria-label="url"]', "https://tujuan-baru-uji.example");
  await page.getByRole("button", { name: "Simpan & nilai ulang" }).click();
  await expect(page.getByText(/rekomendasi lama dibatalkan/)).toBeVisible();
  await expect(page.getByText("Menunggu tinjauan").first()).toBeVisible();
  await expect(page.getByText("Rekomendasi dibatalkan (jurnal/tujuan berubah)").first()).toBeVisible();
  await expect(page.locator("div.rounded-xl.border-2", { hasText: "Status Tujuan Pengiriman" }).getByText("KUNING")).toBeVisible();
});

test("ruang validasi: jujur soal belum ada validasi nyata, referensi dulu, lalu proses & ekspor CSV terlindungi", async ({ page }) => {
  await login(page, "peninjau@jd.example");
  await page.getByRole("link", { name: "Validasi Dunia Nyata" }).click();
  await expect(page.getByText(/Validasi dunia nyata BELUM dilakukan/)).toBeVisible();
  await expect(page.getByText("FIKTIF — bukan validasi nyata").first()).toBeVisible();
  await page.getByRole("button", { name: /Buat kerangka cakupan/ }).click();
  await expect(page.getByText(/10 kerangka kasus dibuat/)).toBeVisible();
  await expect(page.getByText("MENUNGGU REFERENSI MANUAL").first()).toBeVisible();
  await expect(page.getByText("BELUM DIJALANKAN").first()).toBeVisible();
  // lengkapi kerangka: pakai jurnal FIKTIF (fixture) hanya untuk menguji mekanik; ditandai fiktif agar tidak dihitung sebagai validasi nyata
  await page.getByRole("link", { name: "VC-005" }).click();
  await expect(page.getByText(/masih kerangka/)).toBeVisible();
  await page.fill('input[aria-label="title"]', "Jurnal Riset Kesehatan Nusantara (FIKTIF)");
  await page.fill('input[aria-label="issn"]', "9900-0016");
  await page.fill('input[aria-label="submitted"]', "https://jurnal-riset-kesehatan.example");
  await page.fill('textarea[aria-label="sources"]', "Sumber uji | dokumen-uji-fiktif | 2026-10-01 | 2026-11-02");
  await page.getByRole("button", { name: "Simpan detail" }).click();
  await expect(page.getByText("Detail kasus disimpan")).toBeVisible();
  // rekomendasi aplikasi TIDAK terungkap sebelum referensi
  await expect(page.getByText("Menunggu referensi manual")).toBeVisible();
  await expect(page.getByRole("button", { name: /Jalankan aplikasi/ })).toHaveCount(0);
  await page.fill('textarea[name="rationale"]', "Referensi manual uji: jurnal dan situs terkonfirmasi sah (fiktif).");
  await page.fill('textarea[name="sources"]', "Halaman penerbit fiktif | https://example.org/uji | 2026-10-01 | 2026-11-02");
  await page.selectOption('select[name="journalStatus"]', "GREEN");
  await page.selectOption('select[name="destinationStatus"]', "GREEN");
  await page.selectOption('select[name="finalStatus"]', "GREEN");
  await page.getByRole("button", { name: "Kunci referensi manual" }).click();
  await expect(page.getByText("Referensi manual dicatat dan dikunci")).toBeVisible();
  await page.getByRole("button", { name: "Jalankan aplikasi pada kasus ini" }).click();
  await expect(page.getByText("Proses selesai")).toBeVisible();
  await expect(page.getByText("Proses #1")).toBeVisible();
  await expect(page.getByText(/engine 1B/)).toBeVisible();
  // ekspor CSV: peninjau boleh tanpa narasi; narasi hanya Kepala; admin ditolak; tanpa narasi bawaan
  const r = await page.request.get(`${BASE}/api/validation/export`, { headers: { cookie: await cookies(page) } });
  expect(r.status()).toBe(200);
  expect(r.headers()["cache-control"]).toBe("no-store");
  const csv = (await r.body()).toString();
  expect(csv).toContain("INTERNAL-RAHASIA");
  expect(csv).not.toContain("Referensi manual uji");
  expect((await page.request.get(`${BASE}/api/validation/export?narrative=1`, { headers: { cookie: await cookies(page) } })).status()).toBe(403);
  await logout(page);
  await login(page, "admin@jd.example");
  expect((await page.request.get(`${BASE}/api/validation/export`, { headers: { cookie: await cookies(page) }, maxRedirects: 0 })).status()).toBe(403);
  await page.goto("/validation");
  await expect(page).toHaveURL(/error=forbidden|\/$/);
  await logout(page);
  await login(page, "kepala@jd.example");
  const rh = await page.request.get(`${BASE}/api/validation/export?narrative=1`, { headers: { cookie: await cookies(page) } });
  expect(rh.status()).toBe(200);
  expect((await rh.body()).toString()).toContain("Referensi manual uji");
});

test("Sumber Rujukan: DOAJ/Crossref tidak ditampilkan LIVE tanpa smoke test sukses", async ({ page }) => {
  await login(page, "kepala@jd.example");
  await page.goto("/sources");
  await expect(page.getByText(/Belum pernah terbukti hidup/).first()).toBeVisible();
  await expect(page.getByText("Tanggal pengamatan data sumber * (wajib)")).toBeVisible();
});
