# Deployment & Keamanan

## Persyaratan
Node.js ≥ 20, PostgreSQL 14+ (disarankan), penyimpanan berkas di luar webroot (volume terenkripsi atau objek privat), reverse proxy TLS.

## Langkah
1. `cp .env.example .env`; isi `SESSION_SECRET` (≥32 karakter acak; aplikasi **menolak start** produksi tanpa ini), `PUBLIC_BASE_URL` (HTTPS), `STORAGE_DIR`.
2. **PostgreSQL:** ubah `provider = "postgresql"` di `prisma/schema.prisma`, ubah kolom `*Json String` ke `Json` bila diinginkan (kode saat ini memakai `JSON.stringify`, jadi `String`/`Text` tetap bekerja), set `DATABASE_URL`, buat ulang migrasi (`prisma migrate dev`) pada lingkungan pengembangan lalu `prisma migrate deploy` di produksi. Migrasi yang disertakan dibuat untuk SQLite.
3. `npm ci && npm run build && npm start` (di belakang TLS). **Jangan** menjalankan `db:seed` di produksi, atau ganti seluruh akun/kata sandi demo segera.
4. Buat akun nyata (Administrator → Pengaturan → Pengguna), lalu nonaktifkan akun demo.
5. Kepala Unit memasukkan kebijakan resmi (versi baru, centang RESMI), mengisi identitas surat & penandatangan, dan mengimpor dataset rujukan sah. Nonaktifkan dataset demonstrasi fiktif.

## Kontrol keamanan yang ada
Autentikasi (bcrypt, JWT httpOnly + validasi pengguna aktif di DB), otorisasi peran di server (halaman, aksi, API), middleware sesi, audit log, validasi unggahan (ekstensi + magic bytes + 10 MB, nama aman, jalur dibatasi), dokumen hanya via API terproteksi (attachment, CSP sandbox, `nosniff`, audit akses; ADMIN tidak membaca dokumen), SSRF guard (`safeFetch`: skema/port/kredensial/IP privat/redirect/ukuran/tipe/DNS-pin saat koneksi langsung), pagar prompt-injection, ekspor CSV anti formula-injection, header keamanan, tidak ada rahasia di klien, tidak ada email/pembayaran/pengiriman otomatis, kontrol retensi (hapus permanen berkas per permohonan, audit dipertahankan).

## Yang perlu ditambah untuk produksi (Fase 3)
- SSO institusional (OIDC/SAML) & MFA; pembatas laju terdistribusi (saat ini di memori); proteksi CSRF tambahan di luar bawaan Server Actions (cek Origin) bila di belakang proxy khusus.
- Penyimpanan objek terenkripsi + antivirus pada unggahan; OCR; kebijakan retensi terjadwal.
- Tanda tangan elektronik tersertifikasi (BSrE/penyedia) menggantikan placeholder.
- Pencadangan terjadwal basis data & berkas, pemantauan/alert, rotasi rahasia, SIEM untuk audit log.
- Mode proxy keluar: bila `HTTPS_PROXY` diset, `safeFetch` memakai proxy sehingga pin DNS saat koneksi tidak berlaku (validasi pra-koneksi tetap berjalan); kendalikan egress di firewall.
- Pertimbangkan data pribadi (UU PDP): minimalkan, atur akses, dan tetapkan retensi.


## Pilot terkendali
Untuk satu instance pilot di belakang HTTPS, cadangan/pemulihan, retensi, dan smoke test ikuti **docs/PILOT_RUNBOOK.md**. Pisahkan `APP_MODE`, `DATABASE_URL`, dan `STORAGE_DIR` antara DEMO dan PILOT.
