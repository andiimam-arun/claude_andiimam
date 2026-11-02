# Journal Detective

**Verifikasi Jurnal. Lindungi Riset. Dukung Integritas Akademik.**
Platform pendukung keputusan integritas jurnal dan klirens publikasi untuk Unit Publikasi fakultas (Universitas Hasanuddin).
Sistem ini **penasihat**, bukan pembuat tuduhan otomatis atau daftar hitam. Keputusan institusional hanya oleh pejabat manusia.

Antarmuka berbahasa Indonesia (bawaan) dengan opsi English. Untuk keterbatasan dan fitur yang belum ada, lihat [Status & keterbatasan](#status--keterbatasan).

## Dua dimensi keputusan (selalu terpisah)
1. **Integritas jurnal** — HIJAU / KUNING / MERAH (dengan kategori MERAH: *integritas kritis* vs *tidak memenuhi kebijakan*).
2. **Klirens administratif naskah** — dinilai per tahap (pra-pengiriman … terbit).
3. **Rekomendasi akhir** — gabungan transparan. Dokumen valid tidak pernah mengesampingkan pemalsuan identitas jurnal terkonfirmasi.

Detail aturan: [docs/ASSESSMENT_POLICY.md](docs/ASSESSMENT_POLICY.md).

## Lingkungan DEMO dan PILOT
`APP_MODE=DEMO` (bawaan; data fiktif, `npm run db:seed`) dan `APP_MODE=PILOT` (data nyata, tanpa data/akun demo) memakai **basis data dan folder unggahan terpisah** dan saling menolak berjalan di atas data yang lain. Banner lingkungan selalu tampil. Inisialisasi pilot yang aman: `npm run pilot:init` (menolak basis data tidak kosong). Panduan lengkap: **[docs/PILOT_RUNBOOK.md](docs/PILOT_RUNBOOK.md)**. Validasi dunia nyata: [docs/REAL_WORLD_VALIDATION.md](docs/REAL_WORLD_VALIDATION.md) (**belum dilakukan**). Laporan Fase 1B: [docs/PHASE_1B_REPORT.md](docs/PHASE_1B_REPORT.md).

## Persyaratan
Node.js ≥ 20 (diuji pada 22), npm. Basis data bawaan SQLite (tanpa server). Produksi: PostgreSQL (lihat [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Instalasi & menjalankan
```bash
cd journal-detective
npm install
cp .env.example .env        # lalu isi SESSION_SECRET (openssl rand -base64 48)
npx prisma migrate deploy   # menerapkan migrasi
npm run db:seed             # data demonstrasi FIKTIF (opsional)
npm run dev                 # http://localhost:3000
```
Produksi lokal: `npm run build && npm start`. Reset basis data demo: `npm run db:reset` (hanya SQLite lokal).

### Akun demonstrasi (fiktif; kata sandi = `DEMO_PASSWORD`, bawaan `demo-journal-detective`)
| Email | Peran |
|---|---|
| kepala@jd.example | Kepala Unit Publikasi |
| peninjau@jd.example | Peninjau |
| admin@jd.example | Administrator |
| mahasiswa@jd.example | Mahasiswa |

**Ganti/hapus akun dan kata sandi ini sebelum penggunaan nyata.**

### Data demonstrasi (9 skenario FIKTIF)
Seluruh jurnal/penerbit/ISSN (9900-xxxx)/domain (`.example`) pada `fixtures/` dan seed **fiktif** dan berlabel. Kebijakan awal adalah **DEMONSTRASI** (bukan peraturan resmi) dan bannernya tampil sampai Kepala Unit menerbitkan kebijakan resmi.

| Ref. | Skenario | Hasil yang diharapkan |
|---|---|---|
| PK-0001 | Pra-pengiriman, jurnal terindeks aktif, situs cocok domain resmi (Case A) | Jurnal HIJAU, akhir HIJAU |
| PK-0002 | Diterima, surat penerimaan belum diverifikasi (Case B) | Jurnal HIJAU, administratif KUNING |
| PK-0003 | Situs klon terkonfirmasi + surat penerimaan (Case C/H) | MERAH, klirens diblokir permanen |
| PK-0004 | Cakupan Scopus dihentikan, kebijakan mewajibkan aktif (Case D) | MERAH kebijakan, bukan "predator" |
| PK-0005 | Kecocokan daftar Beall historis (Case E) | KUNING, perlu tinjauan |
| PK-0006 | Tidak ada data rujukan jurnal (Case F) | KUNING, tidak ada HIJAU palsu |
| PK-0007 | Diterima tanpa putaran revisi, bukti koheren (Case G) | HIJAU / HIJAU |
| PK-0008 | Domain mirip domain resmi (beda satu huruf) | KUNING, menunggu konfirmasi peninjau |
| PK-0009 | Faktur APC mengarah ke domain di luar domain resmi | Tanda HIGH, administratif KUNING |

Case I (administrator tidak bisa menerbitkan surat resmi) didemonstrasikan lewat akun admin pada halaman surat dan diuji otomatis.

## Pengujian & mutu
```bash
npm run typecheck
npm run lint
npm test                                    # vitest (103): mesin keputusan, layanan, tujuan/klon, validasi, PILOT, cadangan, adapter eksternal (fixture), keamanan, i18n
PW_CHROMIUM=/path/ke/chromium npm run test:e2e   # Playwright (membangun & menjalankan app pada port 3100 dengan DB e2e)
```
`PW_CHROMIUM` hanya perlu bila versi browser Playwright terpasang berbeda.

## Konfigurasi (`.env`)
Lihat `.env.example`. Rahasia hanya di server; tidak ada kunci di sisi browser. `SCOPUS_API_KEY` dan `ANTHROPIC_API_KEY` opsional (kosong = fitur nonaktif dan ditampilkan sebagai UNAVAILABLE). `DISABLE_EXTERNAL_LOOKUPS=1` mematikan panggilan ke Crossref/DOAJ.

## Audit penerimaan
Laporan audit Fase 1, klasifikasi persyaratan, dan langkah validasi manual: [docs/ACCEPTANCE_REPORT.md](docs/ACCEPTANCE_REPORT.md).

## Status & keterbatasan
**Berfungsi (Fase 1):** dasbor responsif, investigasi jurnal 6 pemeriksaan, **Journal Passport** (registri jurnal + jadwal validasi ulang), halaman **Riwayat Penilaian** yang bisa dicari, impor Scopus/SCImago/Beall/daftar-dibajak (CSV/XLSX, dengan asal-usul & versi), bukti manual terdokumentasi, mesin keputusan berbasis aturan, laporan PDF, formulir permohonan + unggah bukti + ekstraksi teks PDF/TXT/EML, tanda ketidakkonsistenan, daftar periksa & linimasa, tinjauan manusia + enam aksi, surat klirens (draf berwatermark, PDF, QR verifikasi publik), kebijakan berversi, audit log, peran & otorisasi, DOAJ & Crossref (API publik).

**Titik ekstensi / belum lengkap (jujur):**
- Scopus Serial Title API: kode ada namun **belum diuji terhadap API langsung** (butuh kunci berlisensi); status diturunkan dari tahun cakupan dan selalu butuh konfirmasi manusia.
- SCImago, Retraction Watch Hijacked Journal Checker, Beall: **tidak ada integrasi langsung** (tanpa scraping); gunakan impor sah atau bukti manual.
- OCR gambar belum tersedia (PNG/JPG disimpan; kolom diisi manual). Ekstraksi DOCX belum ada.
- Panggilan DOAJ/Crossref **tidak pernah terbukti hidup**: egress lingkungan pembangunan menolak host tersebut (403); adapter hanya teruji pada jalur UNAVAILABLE/ERROR. Lihat `docs/ACCEPTANCE_REPORT.md`.
- Tanda tangan elektronik tersertifikasi belum terintegrasi (ada placeholder). Nomor surat resmi selalu dimasukkan manusia.
- Ringkasan AI (opsional) belum diuji dengan layanan langsung; tidak pernah memengaruhi status.
- Teks alasan/antarmuka dwibahasa; narasi bukti otomatis & templat surat berbahasa Indonesia (templat dapat disunting).
- Pembatas laju login berada di memori (satu proses). Autentikasi institusional (SSO), penyimpanan objek, pencadangan: Fase 3 (lihat deployment).
- Komponen UI bergaya shadcn/ui ditulis manual (tanpa Radix); tidak memakai CLI shadcn.
- Tidak ada skor numerik sengaja; keputusan murni aturan.
