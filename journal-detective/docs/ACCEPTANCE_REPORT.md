# Laporan Audit Penerimaan Fase 1

Tanggal audit: 2026-11-02. Lingkungan: sandbox Linux, Node 22, SQLite, Chromium Playwright. Semua klaim di bawah didukung tes/uji yang disebut; yang tidak dapat diuji dinyatakan **BLOCKED**.
Audit tidak memulai Fase 2.

## 1. Klasifikasi persyaratan

| # | Persyaratan | Status | Bukti |
|---|---|---|---|
| 1 | Mesin investigasi jurnal (nama, ISSN, situs → 6 pemeriksaan) | **WORKING** (untuk sumber impor/manual) | E2E `acceptance` #1; `services.test` registri/impor/XLSX/manual |
| 1a | Verifikasi langsung DOAJ & Crossref | **BLOCKED** | Egress sandbox menolak `doaj.org`/`api.crossref.org` (HTTP 403 pada CONNECT). Adapter melaporkan `UNAVAILABLE/ERROR`, tidak mengarang data. Tidak ada bukti keberhasilan panggilan langsung. |
| 1b | Scopus Serial Title API | **BLOCKED / belum teruji** | Tidak ada kunci berlisensi; kode ada tetapi belum pernah dijalankan terhadap API. |
| 1c | SCImago, Retraction Watch, Beall | **PARTIAL** | Tidak ada integrasi langsung (disengaja, tanpa scraping); hanya impor CSV/XLSX atau bukti manual. Impor CSV, XLSX teruji. |
| 2 | Keputusan HIJAU/KUNING/MERAH yang dapat dijelaskan | **WORKING** | `engine.test` (37 tes, Case A–I), `i18n.test` (setiap kode alasan/tindakan punya teks) |
| 3 | Tinjauan bukti mahasiswa | **WORKING** (PDF/TXT/EML) / **PARTIAL** (gambar, DOCX) | E2E #2: PDF sungguhan diunggah, teks diekstrak, dikoreksi manusia. Gambar disimpan tanpa OCR; DOCX tidak diekstrak (ditandai di UI). |
| 4 | Journal Passport | **WORKING** | E2E #4; insiden klon permanen pada paspor (unit test) |
| 5 | Dasbor interaktif | **WORKING** | Tangkapan layar desktop & mobile diperiksa; grafik terender (ditemukan & diperbaiki: animasi menyebabkan grafik kosong saat dirender cepat) |
| 6 | Status jurnal vs administratif terpisah | **WORKING** | Tiga kartu terpisah; `engine.test` Case B/H; `final.administrativeStatus` ≠ `journalStatus` |
| 7 | Berbasis bukti & dapat ditelusuri | **WORKING** | Tiap bukti: sumber, URL/ref, tanggal diambil, tanggal data, integrasi, keparahan, kekuatan |
| 8 | Pembeda live/impor/manual/tidak tersedia | **WORKING** | Label `integration` di semua kartu; E2E #1 memeriksa label "Bukti manual" |
| 9 | Tidak mengarang hasil | **WORKING** | Case F; "tidak ditemukan pada impor" = tidak konklusif; bukti VERIFIED tanpa URL/ref ditolak (E2E #1) |
| 10 | Deteksi klon prioritas tinggi | **WORKING** | Case C/H; klon yang dikonfirmasi **setelah** penilaian tetap memblokir saat persetujuan (celah ditemukan & diperbaiki) |
| 11 | Penjelasan + tindakan lanjutan tiap penilaian | **WORKING** | Halaman investigasi & laporan PDF |
| 12 | Persetujuan manusia berwenang | **WORKING** | Hanya HEAD; ADMIN/Reviewer/Student ditolak (unit + E2E); surat resmi butuh APPROVED + nomor manual |
| 13 | Riwayat penilaian dapat dicari + tanggal validasi ulang | **WORKING** | Halaman Riwayat Penilaian; kolom validasi ulang pada Journal Passport; E2E #4 |
| 14 | ≥ 8 skenario fiktif | **WORKING** | 9 permohonan seed berlabel FIKTIF (README) |
| 15 | Petunjuk pengembangan & deployment | **PARTIAL** | README + `docs/DEPLOYMENT.md` ada. Jalur PostgreSQL, Docker, dan pencadangan **belum diuji**. |
| 16 | Tanda tangan elektronik/SSO/portal kompleks | Di luar lingkup Fase 1 | Placeholder saja |

## 2. Uji alur lengkap (E2E `tests/e2e/acceptance.spec.ts`, lulus)
1. Peninjau membuat investigasi (nama, ISSN, situs) → **KUNING**, Scopus *BELUM TERVERIFIKASI*.
2. Bukti Scopus VERIFIED tanpa URL ditolak; bukti manual dengan sumber dicatat (Scopus, domain resmi, korroborasi) → **Nilai ulang → HIJAU**, basis berlabel "Bukti manual".
3. Mahasiswa mengajukan dengan **PDF sungguhan**; peninjau melihat ekstraksi (ID naskah, ISSN) dan menandai ditinjau; klirens administratif tetap KUNING sampai daftar periksa diverifikasi; peninjau merekomendasikan.
4. Kontrol akses dokumen: anonim → dialihkan; **administrator 403**; **mahasiswa lain 403** dan 404 pada permohonan orang lain; pemilik & peninjau 200 dengan sha256 identik, `attachment`.
5. Kepala Unit menyetujui (penilaian divalidasi ulang saat itu); permohonan **terkunci**; Journal Passport menampilkan jurnal berlabel FIKTIF + riwayat + jadwal validasi ulang; Riwayat Penilaian memuat penilaian KUNING awal dan HIJAU.
6. Persistensi (`scripts/restart-check.mjs`): server dimatikan dan dinyalakan ulang → dokumen unggahan (sha256 identik, HTTP 200), 4 baris riwayat penilaian, jumlah jurnal/penilaian/dokumen identik. (Jumlah audit bertambah karena aktivitas pemeriksaan sendiri.)

## 3. Inventaris sumber data (status aktual)
| Sumber | Status nyata di build ini |
|---|---|
| Scopus Source List | **IMPORTED_DATA**; hanya berkas **fiktif demonstrasi** (`fixtures/`) dimuat; berlabel `[DATA DEMONSTRASI FIKTIF]` pada setiap bukti |
| SCImago | IMPORTED_DATA (fiktif) / MANUAL_EVIDENCE; tanpa integrasi langsung |
| Beall (historis) | IMPORTED_DATA (fiktif); tidak dibundel |
| Daftar jurnal dibajak | IMPORTED_DATA (fiktif); Retraction Watch asli **tidak terhubung** — manual |
| DOAJ, Crossref | Kode ada; **BLOCKED** di sandbox (UNAVAILABLE/ERROR). Belum pernah terbukti LIVE_VERIFIED |
| Scopus API | **BLOCKED** (tanpa kunci); belum teruji |
| LLM ringkasan | **BLOCKED** (tanpa kunci); nonaktif; tidak memengaruhi status |
| Bukti manual E2E | MANUAL_EVIDENCE, dibuat uji dengan label FIKTIF |
Tidak ada hasil simulasi yang disajikan sebagai verifikasi nyata. Jurnal seed ditandai FIKTIF di Journal Passport.

## 4. Verifikasi aturan wajib
| Aturan | Hasil | Bukti |
|---|---|---|
| Status jurnal & administratif terpisah | Lulus | Case B, H; UI tiga kartu |
| Tanpa bukti ≠ HIJAU palsu | Lulus | Case A (tanpa identitas/situs), Case F, E2E #1 |
| Klon terkonfirmasi memblokir | Lulus | Case C/H, service test, E2E klon; persetujuan menolak (hard block) |
| Beall saja ≠ MERAH | Lulus | Case E (KUNING; setelah dikonfirmasi tetap bukan MERAH) |
| Indeksasi dihentikan dinilai terhadap kebijakan | Lulus | Case D + uji kebijakan v2/v3 (kebijakan tanpa Scopus → layak) |
| Diterima tanpa revisi tidak ditolak | Lulus | Case G + seed PK-0007 HIJAU/HIJAU |
| Surat resmi butuh persetujuan manusia | Lulus | Case I; draf berwatermark, surat terbit tidak (diuji dari teks PDF) |
| Rekaman & unggahan bertahan setelah restart | Lulus | `restart-check.mjs` |
| Pengguna tak berwenang tak dapat membuka dokumen | Lulus | E2E #3 (anonim, admin, mahasiswa lain) |

## 5. Cacat yang ditemukan audit dan sudah diperbaiki
1. **Ekstraksi PDF gagal pada PDF modern** (object streams; pdf-parse 1.1.1) → diganti pdf-parse 2.x; terbukti dengan PDF sungguhan.
2. **Persetujuan memakai penilaian basi**: klon dikonfirmasi setelah penilaian tidak memblokir → persetujuan kini selalu menilai ulang jurnal saat itu.
3. **Permohonan final dapat diubah** (tahap/peristiwa/unggahan lewat aksi langsung) → dikunci setelah disetujui/ditolak.
4. **Watermark DRAF terpotong** di tepi halaman PDF (ditemukan lewat ekstraksi teks) → ukuran/posisi diperbaiki.
5. **Dasbor**: grafik kosong saat render cepat (animasi); **insiden klon dihitung 0** padahal ada → kini dihitung dari semua penilaian; insiden klon kini **permanen** pada paspor jurnal.
6. **Pencarian eksternal gagal bila DNS lokal tidak tersedia di balik proxy** → pra-cek DNS dilewati saat memakai proxy (egress dikendalikan di proxy; dicatat di DEPLOYMENT).
7. Jurnal seed tidak berlabel FIKTIF di Journal Passport → diperbaiki.

## 6. Cacat/keterbatasan yang tersisa
- Verifikasi langsung DOAJ/Crossref/Scopus **tidak pernah terbukti** di lingkungan ini (BLOCKED); perlu uji di mesin dengan akses jaringan.
- Status HIJAU/KUNING/MERAH di ringkasan dasbor dan daftar Journal Passport = penilaian **terakhir** per jurnal (bisa HIJAU walau ada insiden klon sebelumnya; insiden terlihat sebagai peringatan permanen & penghitung insiden).
- Tidak ada OCR (tangkapan layar PNG/JPG butuh pengisian manual); DOCX tidak diekstrak.
- Penilaian ulang otomatis hanya saat tombol/persetujuan; belum ada pengingat terjadwal (hanya tanggal jatuh tempo + daftar).
- Pembatas laju login di memori; tanpa SSO/MFA; tanpa antivirus unggahan; tanpa pencadangan otomatis.
- Basis data uji SQLite; PostgreSQL **belum diuji**. Tidak ada Dockerfile/CI.
- Cookie sesi `secure` di produksi: pada HTTP non-localhost login tidak akan bertahan (wajib HTTPS, atau `INSECURE_COOKIES=1` hanya untuk uji).
- Aturan keputusan belum divalidasi terhadap kasus jurnal nyata; kebijakan awal adalah DEMONSTRASI.
- Uji E2E mengasumsikan basis data bersih (`db:reset` dijalankan otomatis); belum ada uji aksesibilitas otomatis atau uji beban.

## 7. Hasil uji otomatis
`tsc` bersih · `next lint` bersih · Vitest **56/56** · Playwright **13/13** · `scripts/restart-check.mjs` lulus.

## 8. Langkah validasi manual (Anda)
1. `npm install && cp .env.example .env` (isi `SESSION_SECRET`) → `npx prisma migrate deploy && npm run db:seed && npm run dev`.
2. Masuk sebagai `peninjau@jd.example` → **Investigasi Jurnal Baru**: isi jurnal *nyata* yang Anda kenal (nama, ISSN, situs). Harapan: KUNING dengan Scopus *belum terverifikasi* (belum ada impor). Periksa tiap alasan & tindakan.
3. **Sumber Rujukan** (sebagai `admin@`/`kepala@`): impor Scopus Source List sah Anda → **Nilai ulang**; catat basis "Data impor (historis)" dan tanggal data, bukan "langsung".
4. Tambahkan bukti manual domain resmi & korroborasi (dengan URL) → nilai ulang → cek apakah HIJAU sesuai penilaian manusia Anda. Coba domain berbeda/mirip → harus KUNING lalu, setelah konfirmasi, MERAH.
5. Pilih jurnal yang Anda tahu sudah dihentikan Scopus → harus MERAH *kebijakan* (bukan predator).
6. Masuk sebagai `mahasiswa@`, ajukan permohonan tahap "Diterima" dengan PDF nyata (anonimkan). Cek ekstraksi sebagai peninjau; coba ubah judul pada surat → tanda ketidakkonsistenan.
7. Coba `kepala@`: setujui dengan hasil non-HIJAU (harus minta justifikasi), lalu terbitkan surat dengan nomor Anda. Coba `admin@`: tidak bisa menerbitkan. Pindai/buka tautan QR `/verify/...`.
8. Buka **Riwayat Penilaian** & **Journal Passport**; hentikan dan nyalakan ulang server; pastikan data masih ada.
9. Di mesin dengan internet bebas, jalankan investigasi pada jurnal ber-DOAJ/Crossref dan periksa label LIVE_VERIFIED.

## 9. Kesiapan pilot internal terbatas
**Layak untuk pilot internal terbatas dengan syarat**, bukan siap produksi:
- Kepala Unit memasukkan kebijakan RESMI, identitas surat, dan dataset Scopus sah; akun demo dihapus.
- Dijalankan di belakang HTTPS dengan `SESSION_SECRET`, pada SATU instance, oleh pengguna terbatas yang dikenal; **bukan** untuk data mahasiswa sensitif dalam skala luas sebelum SSO/MFA, pencadangan, dan penyimpanan terenkripsi ada.
- Setiap rekomendasi ditinjau manusia; hasil sistem dibandingkan dengan penilaian manual pada 10–20 jurnal dikenal sebelum dipercaya.
- Belum ada bukti kesiapan produksi: tanpa uji beban, uji PostgreSQL, uji penetrasi, atau verifikasi integrasi langsung.
