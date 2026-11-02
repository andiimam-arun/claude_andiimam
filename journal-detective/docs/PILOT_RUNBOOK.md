# Runbook Pilot Terkendali (Unit Publikasi Fakultas)

Tujuan: membandingkan rekomendasi Journal Detective dengan penilaian manual independen atas **jurnal dan situs nyata**.
Lulus uji perangkat lunak **tidak** membuktikan akurasi penilaian; validasi dunia nyata dicatat terpisah (lihat `REAL_WORLD_VALIDATION.md`).
Semua perintah dijalankan di folder `journal-detective/`. Tidak ada langkah di sini yang menerbitkan surat resmi, mengirim pesan, membayar, atau mengirim naskah.

## 0. Prasyarat
Node.js ≥ 20, satu server di belakang HTTPS (lihat bagian 8), akun operator server. Gunakan **pseudonim** untuk mahasiswa dan dokumen yang sudah **disamarkan** (redacted) pada validasi awal.

## 1. Inisialisasi lingkungan PILOT yang bersih
```bash
cp .env.pilot.example .env.pilot            # isi SESSION_SECRET, PUBLIC_BASE_URL, PILOT_ADMIN_*
set -a; . ./.env.pilot; set +a
npm ci
npm run pilot:init                          # menerapkan migrasi, membuat 1 administrator, TANPA data/akun demo
unset PILOT_ADMIN_PASSWORD
npm run pilot:check                         # harus tanpa FAIL
npm run build && npm start                  # di belakang HTTPS
```
`pilot:init` **menolak** bila basis data tidak kosong/sudah berpenanda, atau bila `DATABASE_URL`/`STORAGE_DIR` memakai lokasi DEMO (`dev.db`, `./storage`). Tidak ada yang dihapus atau ditimpa. Mode DEMO menolak berjalan di atas basis data PILOT dan sebaliknya. Banner lingkungan selalu tampil (DEMO ungu, PILOT biru tua).
DEMO tetap tersedia terpisah: `APP_MODE=DEMO` dengan `.env` DEMO (`npm run db:reset` hanya untuk SQLite DEMO).

## 2. Kebijakan resmi dan akun bernama
1. Masuk sebagai administrator → **Pengaturan → Pengguna**: buat akun **bernama** (Kepala Unit, peninjau). Kata sandi ≥ 10 karakter. Tidak boleh memakai `@jd.example` (ditolak pada PILOT).
2. Masuk sebagai **Kepala Unit** → **Pengaturan → Editor kebijakan**: masukkan aturan resmi fakultas (**bukan** nilai bawaan), centang *Tandai sebagai kebijakan RESMI*, isi catatan. Sampai ini dilakukan, UI menampilkan "Kebijakan resmi belum dikonfigurasi" dan **persetujuan/penerbitan resmi diblokir**.
3. Isi identitas surat & penandatangan (Pengaturan → Identitas). Nomor surat resmi selalu diketik pejabat.
4. Atur masa retensi dokumen (Pengaturan → Retensi). Tidak ada penghapusan otomatis.
Tidak ada aturan, nomor surat, tanda tangan, atau persetujuan yang dikarang sistem.

## 3. Impor Scopus Source List yang sah
**Disarankan:** menu **Database Scopus** (workbook asli 3 sheet, pratinjau sebelum simpan) — lihat `docs/SCOPUS_IMPORT.md`. Bagian di bawah menjelaskan impor generik CSV/XLSX lama.
Tanpa kunci API. Gunakan hanya berkas yang Anda peroleh secara sah sesuai lisensi (mis. unduhan resmi institusi).
**Sumber Rujukan → Impor dataset** → jenis `SCOPUS_SOURCE_LIST`, berkas CSV/XLSX, label versi, **tanggal pengamatan data (wajib)**, asal-usul & dasar lisensi, centang pernyataan sah.
Validasi otomatis menolak: tanpa kolom judul/identifier/status, tanpa tanggal pengamatan, tanggal masa depan, ISSN rusak > 5%. Peringatan dicatat pada dataset. Impor lama dipertahankan; **impor terbaru menggantikan** yang lama untuk identifier yang sama (riwayat tampil sebagai bukti informasi). Bukti dari impor selalu berlabel *Data impor (historis)* dengan tanggal data, dan kedaluwarsa menurut kebijakan (umur maksimum bukti).
Dataset berlabel demo ditolak pada PILOT.

## 4. Mencatat referensi manual independen (SEBELUM membuka hasil aplikasi)
**Validasi Dunia Nyata → Kasus baru** (satu kasus per jurnal/situs/permohonan; pseudonim; URL yang diajukan; URL otentik yang Anda verifikasi sendiri dari sumber independen; tahap; sumber dengan URL/referensi, tanggal data sumber, tanggal pengambilan).
Atau **Buat kerangka cakupan** untuk 10 skenario kosong (status MENUNGGU REFERENSI MANUAL) lalu isi dengan kasus nyata.
Di halaman kasus: **Langkah 1** — catat penilaian manual untuk empat dimensi (identitas jurnal, tujuan, administratif, akhir; boleh *tidak dinilai*), rasional, ketidakpastian, tanggal, sumber. Referensi **dikunci**. Aplikasi tidak dijalankan/ditampilkan sebelum ini. Jangan membuka halaman investigasi jurnal yang sama sebelum mengunci referensi.

## 5. Investigasi jurnal dan situs yang sesuai
Tambahkan bukti yang Anda miliki: impor Scopus (langkah 3), bukti manual bersumber (Investigasi → Tambah bukti manual: status Scopus dari Scopus Sources, host resmi, korroborasi identitas), temuan tujuan (Catat temuan tujuan). Lalu pada kasus: **Langkah 2 — Jalankan aplikasi**. Setiap proses mengunci snapshot bukti, versi kebijakan (+hash), dan versi aplikasi.
Untuk dimensi administratif nyata, buat permohonan (pseudonim, dokumen disamarkan) dan tautkan **ID permohonan** pada kasus.

## 6. Membandingkan dan menyelesaikan perbedaan
Halaman kasus menampilkan perbandingan per dimensi dan arah perbedaan. **Aplikasi lebih longgar daripada referensi (terutama tujuan/akhir)** ditandai *kritis keselamatan* — hentikan pilot dan perbaiki sebelum lanjut. Klasifikasikan setiap perbedaan (aplikasi terlalu longgar/ketat, celah bukti, konflik sumber, cacat aturan, perbedaan tafsir kebijakan, kesalahan referensi, lainnya), catat tindakan korektif, perbaiki, lalu **Uji ulang** (proses baru; riwayat dipertahankan). Ekspor CSV: `Validasi → Ekspor CSV` (tanpa narasi; versi dengan narasi hanya Kepala Unit; berisi data internal — simpan terenkripsi).
Koreksi temuan klon yang keliru: Journal Passport → Temuan tujuan → *Koreksi* (peninjau/Kepala; rasional ≥ 20 karakter + bukti; riwayat dipertahankan).

## 7. Cadangan dan pemulihan
```bash
npm run pilot:backup -- /mnt/enkripsi/backup-$(date +%F)        # DB (VACUUM INTO) + dokumen + manifest sha256
npm run pilot:restore -- /mnt/enkripsi/backup-2026-11-02 /var/lib/jd/restore/pilot.db /var/lib/jd/restore/storage
```
Pemulihan memverifikasi sha256 cadangan sebelum menyalin, menolak menimpa target yang ada (kecuali `--overwrite` secara sadar), lalu memverifikasi jumlah baris dan sha256 setiap dokumen. **Uji pemulihan** dulu dengan data tidak rahasia (uji otomatis `tests/unit/ops.test.ts` melakukannya) dan ulangi di server Anda sebelum menyimpan data nyata. Cadangan berisi data rahasia: volume terenkripsi, akses terbatas, jadwalkan harian, simpan di luar server. PostgreSQL: gunakan `pg_dump`/`pg_restore` + salin `STORAGE_DIR`.
Retensi: `npm run pilot:retention` (dry-run); `-- --execute` menghapus permanen dokumen permohonan final yang melewati masa retensi (jejak audit dipertahankan).

## 8. Deployment satu instance di belakang HTTPS
- Satu proses Next.js (`npm start`, port 3000) di bawah systemd, pengguna non-root, `EnvironmentFile=` berisi `.env.pilot` (izin 600).
- Reverse proxy TLS (Caddy/Nginx) meneruskan ke `127.0.0.1:3000`, meneruskan `X-Forwarded-*`; HSTS aktif. Cookie sesi bertanda `secure` (wajib HTTPS; jangan set `INSECURE_COOKIES`).
- Folder basis data & dokumen di volume terenkripsi, izin 700; di luar webroot.
- Egress keluar dibatasi ke host yang dibutuhkan (DOAJ, Crossref) jika diaktifkan; lihat smoke test di bawah.
- Batas: satu instance (pembatas laju login di memori), tanpa SSO/MFA.
Contoh Caddy: `jurnal-detective.fakultas.example { reverse_proxy 127.0.0.1:3000 }`.

## 9. Smoke test sumber eksternal (operator, di server target)
```bash
npm run pilot:smoke
```
Memanggil DOAJ dan Crossref sungguhan (satu permintaan per sumber), mencetak hasil mentah, menulis `smoke-report-<tanggal>.json`, dan menyimpan hasil agar **Sumber Rujukan** menampilkan "terakhir diuji hidup". Periksa isi laporan; integrasi dianggap hidup hanya bila `LIVE_OK` dengan isi yang cocok.

## 10. AI eksternal
Nonaktif. Aktif hanya bila operator mengatur `ANTHROPIC_API_KEY`, `AI_EXTERNAL_ENABLED=1`, dan `AI_DATA_HANDLING_ACK` (pengakuan tertulis penanganan data). Hanya teks ringkasan temuan jurnal (bukan dokumen/identitas mahasiswa) yang dikirim; AI tidak memengaruhi status.

## 11. Kriteria berhenti
Hentikan pilot dan perbaiki bila: tujuan klon terkonfirmasi mendapat HIJAU; aplikasi lebih longgar daripada referensi pada dimensi tujuan/akhir; bukti demo memenuhi syarat klirens; pemulihan gagal verifikasi.
