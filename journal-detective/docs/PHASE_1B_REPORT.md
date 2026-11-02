# Laporan Fase 1B — Validasi Dunia Nyata & Persiapan Pilot

Tanggal: 2026-11-02. Dasar: `docs/ACCEPTANCE_REPORT.md` (Fase 1). Fase 2 tidak dimulai.
**Ringkasan jujur:** perangkat lunak untuk pilot terkendali sudah disiapkan dan diuji. **Validasi dunia nyata belum dilakukan** (0 kasus nyata), dan integrasi DOAJ/Crossref **belum pernah terbukti hidup**. Tidak ada klaim akurasi penilaian atau kesiapan produksi.

## 1. Yang diimplementasikan
| Area | Isi | Bukti |
|---|---|---|
| Mode DEMO / PILOT | `APP_MODE`; DB & folder unggahan terpisah; penanda lingkungan di DB; PILOT menolak lokasi DEMO; DEMO↔PILOT saling menolak; banner mencolok; PILOT menolak akun `@jd.example` dan dataset/seed demo; bukti `data.demo` dikecualikan pada PILOT | `phase1b.test` (1), `ops.test`, E2E banner, uji hidup PILOT (§3) |
| `pilot:init` aman | menolak DB tidak kosong/berpenanda & lokasi DEMO; tanpa hapus/timpa; 1 admin bernama; tanpa data demo; kebijakan placeholder | `ops.test` (skrip nyata, DB sementara) |
| Kebijakan resmi | UI "Kebijakan resmi belum dikonfigurasi"; persetujuan & penerbitan surat diblokir pada PILOT sampai Kepala menerbitkan kebijakan RESMI | `phase1b.test` (5) |
| Empat penilaian terpisah | `journalStatus` (tanpa situs), `destinationStatus` (host persis), administratif, akhir; kartu terpisah di dasbor/aplikasi/investigasi/Passport/laporan/surat | `engine.test`, E2E `phase1b` |
| Temuan tujuan permanen | tabel `DestinationFinding` (host persis, asal-usul, riwayat); HIJAU jurnal asli tidak menghapus klon pada host lain; koreksi terkontrol (peninjau/Kepala, rasional + bukti, audit, riwayat dipertahankan) | `phase1b.test` (2, koreksi), E2E |
| Normalisasi/perbandingan tujuan | host persis, `www.`, kredensial/port/IP/punycode, subdomain/pengalihan/platform = UNRESOLVED (bukan penipuan) | `domain.test`, `engine.test` |
| Invalidasi perubahan tujuan | rekomendasi dihapus, alur reset, riwayat, penilaian ulang; deteksi perubahan langsung di DB; permohonan final terkunci | `phase1b.test` (3), E2E |
| Persetujuan menilai terkini | penilaian ulang jurnal+tujuan+kebijakan aktif saat APPROVE | `phase1b.test` (4), tes Fase 1 |
| Ruang validasi | kasus, referensi manual terkunci/versi, proses terkunci (snapshot bukti, kebijakan+hash, versi app), perbandingan 4 dimensi, klasifikasi perbedaan, uji ulang, cakupan 10 skenario, ekspor CSV terlindungi | `phase1b.test` (7), E2E |
| Adapter eksternal | klasifikasi galat (429/403/5xx/timeout/rusak/kosong); `pilot:smoke` operator; status "terakhir diuji hidup" di UI | `external.test` (fixture), eksekusi smoke (§3) |
| Impor Scopus | validasi struktur/identifier/status/tanggal pengamatan/ISSN (checksum), versi, audit; impor terbaru menggantikan, lama dipertahankan | `phase1b.test`, `services.test` |
| Pengaman pilot | cadangan/pemulihan terverifikasi sha256, retensi (dry-run + `--execute`), AI eksternal terkunci 3 variabel, runbook | `ops.test`, CLI (§3) |
Cacat yang ditemukan selama pekerjaan ini dan diperbaiki: checksum ISSN tidak diperiksa pada impor (kini ditolak); pra-cek DNS lokal menggagalkan fetch di balik proxy; tes E2E fase 1 yang bergantung pada status gabungan diperbarui ke model empat lapis.

## 2. Perintah dan pemeriksaan yang benar-benar dijalankan
`prisma migrate dev` (migrasi tambahan, tanpa reset) · `npx tsc --noEmit` · `npx next lint` · `npx vitest run` · `npx playwright test` · `node scripts/restart-check.mjs` · `npm run pilot:init` (sukses; kedua kalinya ditolak) · `npm run pilot:check` · server PILOT hidup + Playwright (login demo ditolak, banner, kebijakan belum dikonfigurasi, dataset kosong) · server DEMO di atas DB PILOT (login diblokir) · `npm run pilot:backup` + `pilot:restore` (sukses; ulang ditolak) pada data E2E tidak rahasia · `npm run pilot:retention` · `npm run pilot:smoke` (FAILED jujur) · `curl` ke DOAJ/Crossref (CONNECT 403).

## 3. Hasil uji perangkat lunak (BUKAN validasi dunia nyata)
- `tsc` bersih; `next lint` bersih.
- **Vitest: 103/103 lulus** (7 berkas: mesin keputusan 43, layanan Fase 1 + audit 16, Fase 1B 19, adapter eksternal 9, domain 5, ops 8, i18n 3).
- **Playwright: 19/19 lulus** (alur Fase 1, audit penerimaan, Fase 1B).
- Restart: dokumen sha256 identik & riwayat identik sebelum/sesudah restart; jumlah baris identik.
- Cadangan/pemulihan: manifest+sha256 terverifikasi; baris dan dokumen identik; cadangan yang diubah terdeteksi sebelum penyalinan; menolak menimpa.
- Pemeriksaan wajib: (1) bukti fiktif tidak memberi klirens PILOT ✔ (2) klon tetap diblokir setelah jurnal asli HIJAU ✔ (3) perubahan tujuan membatalkan rekomendasi ✔ (4) persetujuan memakai bukti & kebijakan terkini ✔ (5) kebijakan belum resmi memblokir klirens resmi ✔ (6) pengguna tak berwenang tidak dapat mengakses dokumen/menyetujui ✔ (7) riwayat validasi terkait versi bukti & kebijakan ✔ (8) rekaman & unggahan bertahan setelah restart ✔ (9) pemulihan menjaga rekaman & integritas dokumen ✔.
- **Cacat penghalang pilot (tujuan klon mendapat HIJAU):** tidak ditemukan; tes `Fase 1B (2)` dan E2E "empat dimensi" memverifikasi tujuan klon → MERAH dan permohonan diblokir.

## 4. Validasi dunia nyata
**Kasus nyata selesai: 0. Menunggu masukan petugas: seluruh 10 skenario (NOT RUN / AWAITING MANUAL REFERENCE).** Tidak ada jurnal nyata, bukti otoritatif independen, atau penilaian manual petugas yang disediakan; tidak ada hasil dunia nyata yang dikarang. Empat fixture fiktif (hanya DEMO) berlabel "FIKTIF — bukan validasi nyata" dan tidak dihitung pada cakupan. Detail: `docs/REAL_WORLD_VALIDATION.md`.

## 5. Status integrasi aktual
Lihat matriks di `docs/DATA_SOURCES.md`. Ringkas: Scopus impor = diimplementasikan + teruji fixture (belum ada berkas nyata diimpor); Scopus API = tidak teruji; **DOAJ & Crossref = diimplementasikan + teruji fixture, TIDAK terbukti hidup (egress 403 di sandbox; `pilot:smoke` FAILED)**; SCImago/RW/Beall = impor/manual saja; LLM = nonaktif.

## 6. Penghalang pilot yang tersisa
1. **Kebijakan resmi fakultas** belum dimasukkan (klirens resmi memang diblokir) — hanya Kepala Unit.
2. **Berkas Scopus Source List sah** belum diimpor; tanpa itu hampir semua jurnal nyata KUNING (benar).
3. **Kasus nyata + referensi manual** belum ada; tanpa itu akurasi tidak dapat dinilai.
4. **Smoke test hidup** DOAJ/Crossref di server target belum dijalankan.
5. Belum diuji: PostgreSQL, deployment HTTPS sesungguhnya, pemulihan pada server target; belum ada SSO/MFA, pembatas laju terdistribusi, antivirus unggahan, OCR (tangkapan layar diisi manual), pencadangan terjadwal otomatis.
6. Folder `storage` tidak dibersihkan dari berkas yatim saat basis data diganti (hanya relevan pada DEMO/uji).

## 7. Instruksi menjalankan
DEMO: `cp .env.example .env` (isi `SESSION_SECRET`) → `npx prisma migrate deploy && npm run db:seed && npm run dev`.
PILOT: ikuti `docs/PILOT_RUNBOOK.md` §1 (`.env.pilot.example` → `npm run pilot:init` → `npm run pilot:check` → `npm run build && npm start`).
Uji: `npm run typecheck && npm run lint && npm test` dan `PW_CHROMIUM=/path/chromium npm run test:e2e`.

## 8. Tiga tindakan berikutnya dari Anda
1. **Siapkan input resmi:** keputusan kebijakan resmi fakultas (Kepala Unit memasukkannya di Pengaturan), akun bernama, dan berkas Scopus Source List yang sah — lalu jalankan runbook §1–3 di server pilot.
2. **Pilih 10–20 kasus nyata** (satu per skenario) dan tulis penilaian manual independen **sebelum** melihat aplikasi: runbook §4 (pseudonim, dokumen tersamar).
3. **Jalankan `npm run pilot:smoke` dan uji pemulihan cadangan di server target**, lalu jalankan kasus (runbook §5–6) dan serahkan hasil/perbedaan untuk diperbaiki; keputusan siap/tidak siap pilot lanjutan baru dapat dibuat setelah itu.
