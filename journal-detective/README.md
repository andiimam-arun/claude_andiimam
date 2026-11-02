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

### Data demonstrasi
Seluruh jurnal/penerbit/ISSN (9900-xxxx)/domain (`.example`) pada `fixtures/` dan seed **fiktif** dan berlabel. Enam permohonan seed mendemonstrasikan: HIJAU, diterima-tapi-dokumen-belum-terverifikasi, situs klon terkonfirmasi, Scopus dihentikan (MERAH kebijakan), kecocokan Beall historis (KUNING), dan data rujukan tidak ada. Kebijakan awal adalah **DEMONSTRASI** (bukan peraturan resmi) dan bannernya selalu tampil sampai Kepala Unit menerbitkan kebijakan resmi.

## Pengujian & mutu
```bash
npm run typecheck
npm run lint
npm test                                    # vitest: mesin keputusan (Case A–I), layanan, keamanan, i18n
PW_CHROMIUM=/path/ke/chromium npm run test:e2e   # Playwright (membangun & menjalankan app pada port 3100 dengan DB e2e)
```
`PW_CHROMIUM` hanya perlu bila versi browser Playwright terpasang berbeda.

## Konfigurasi (`.env`)
Lihat `.env.example`. Rahasia hanya di server; tidak ada kunci di sisi browser. `SCOPUS_API_KEY` dan `ANTHROPIC_API_KEY` opsional (kosong = fitur nonaktif dan ditampilkan sebagai UNAVAILABLE). `DISABLE_EXTERNAL_LOOKUPS=1` mematikan panggilan ke Crossref/DOAJ.

## Status & keterbatasan
**Berfungsi (Fase 1):** dasbor responsif, investigasi jurnal 6 pemeriksaan, registri jurnal, impor Scopus/SCImago/Beall/daftar-dibajak (CSV/XLSX, dengan asal-usul & versi), bukti manual terdokumentasi, mesin keputusan berbasis aturan, laporan PDF, formulir permohonan + unggah bukti + ekstraksi teks PDF/TXT/EML, tanda ketidakkonsistenan, daftar periksa & linimasa, tinjauan manusia + enam aksi, surat klirens (draf berwatermark, PDF, QR verifikasi publik), kebijakan berversi, audit log, peran & otorisasi, DOAJ & Crossref (API publik).

**Titik ekstensi / belum lengkap (jujur):**
- Scopus Serial Title API: kode ada namun **belum diuji terhadap API langsung** (butuh kunci berlisensi); status diturunkan dari tahun cakupan dan selalu butuh konfirmasi manusia.
- SCImago, Retraction Watch Hijacked Journal Checker, Beall: **tidak ada integrasi langsung** (tanpa scraping); gunakan impor sah atau bukti manual.
- OCR gambar belum tersedia (PNG/JPG disimpan; kolom diisi manual). Ekstraksi DOCX belum ada.
- Panggilan DOAJ/Crossref **tidak dapat diverifikasi hidup di lingkungan pembangunan** (jaringan terbatas); adapter diuji pada jalur UNAVAILABLE.
- Tanda tangan elektronik tersertifikasi belum terintegrasi (ada placeholder). Nomor surat resmi selalu dimasukkan manusia.
- Ringkasan AI (opsional) belum diuji dengan layanan langsung; tidak pernah memengaruhi status.
- Teks alasan/antarmuka dwibahasa; narasi bukti otomatis & templat surat berbahasa Indonesia (templat dapat disunting).
- Pembatas laju login berada di memori (satu proses). Autentikasi institusional (SSO), penyimpanan objek, pencadangan: Fase 3 (lihat deployment).
- Komponen UI bergaya shadcn/ui ditulis manual (tanpa Radix); tidak memakai CLI shadcn.
- Tidak ada skor numerik sengaja; keputusan murni aturan.
