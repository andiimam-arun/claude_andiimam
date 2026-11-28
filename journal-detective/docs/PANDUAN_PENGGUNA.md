# Panduan Pengguna — Journal Assessment

Fakultas Kesehatan Masyarakat (Faculty of Public Health), Universitas Hasanuddin
Unit Manajemen Publikasi (PMU)

> **Sifat aplikasi.** Journal Assessment adalah alat **pendukung keputusan**. Aplikasi mengumpulkan bukti, menjelaskan alasan, dan menyiapkan draf. **Keputusan akhir selalu ada pada manusia** (Peninjau dan Kepala Unit). Aplikasi tidak pernah menyatakan sebuah jurnal "bagus" atau "palsu" tanpa bukti, dan tidak menerbitkan surat tanpa persetujuan.

---

## Bab 1. Dasar-dasar

### 1.1 Peran pengguna

| Peran | Dapat melakukan | Tidak dapat |
|---|---|---|
| **Mahasiswa** | Mengajukan permohonan klirens, melihat status, mengunduh surat yang sudah disetujui | Melihat investigasi, bukti, atau pengaturan |
| **Peninjau (Reviewer)** | Investigasi jurnal, tinjau bukti, usulkan keputusan, validasi dunia nyata | Mengubah kebijakan, impor data rujukan, kelola akun |
| **Kepala Unit Publikasi (HEAD)** | Semua milik Peninjau + persetujuan akhir + impor data rujukan + ubah kebijakan | Kelola akun |
| **Administrator** | Kelola akun, impor data rujukan, ubah kebijakan, lihat riwayat | Menyetujui klirens |

### 1.2 Mode DEMO dan PILOT

- **DEMO**: berisi 9 skenario fiktif untuk latihan. Tidak boleh dipakai untuk keputusan nyata. Ada label mode di layar.
- **PILOT**: data nyata. Dipakai setelah tim siap dan sumber eksternal sudah diuji (lihat Bab 8).

Mode ditentukan oleh `APP_MODE` di file `.env`. Jangan mencampur database DEMO dan PILOT.

### 1.3 Masuk dan keluar

1. Buka alamat aplikasi (lokal: `http://localhost:3000`).
2. Masukkan email dan kata sandi dari Administrator.
3. Ganti kata sandi sementara pada login pertama.
4. Pilih bahasa (Indonesia/English) di sudut layar. **Keluar** ada di bagian bawah menu kiri.

### 1.4 Empat penilaian yang selalu terpisah

Aplikasi sengaja **tidak** menggabungkan semuanya menjadi satu skor:

1. **Status identitas jurnal**: apakah jurnal ini benar-benar ada dan siapa penerbitnya.
2. **Status tujuan (alamat situs yang tepat)**: apakah alamat web yang diajukan adalah situs resmi jurnal, atau tiruan.
3. **Klirens administratif**: apakah persyaratan administratif PMU terpenuhi.
4. **Keputusan akhir**: gabungan ketiganya, **selalu disetujui manusia**.

Satu jurnal sah bisa punya situs tiruan. Karena itu status per-alamat (host) dicatat permanen. Situs tiruan yang terkonfirmasi adalah **blokir keras**.

### 1.5 Arti status bukti

| Status | Arti |
|---|---|
| VERIFIED | Terbukti dari sumber yang dapat dilacak |
| REPORTED_UNVERIFIED | Ada laporan, belum diverifikasi |
| NOT_FOUND | Sumber diperiksa, data tidak ditemukan |
| UNAVAILABLE | Sumber tidak dapat diakses saat ini |
| CONFLICTED | Sumber saling bertentangan |

Aturan penting:

- **Tidak ditemukan di data impor ≠ tidak terindeks.** Artinya hanya "belum terverifikasi".
- **Inactive di Scopus ≠ jurnal berkualitas buruk.** Itu status cakupan, bukan penilaian mutu.
- **Accepted (Scopus) ≠ aktif.** Jurnal yang diterima belum tentu sudah terindeks.
- **Terindeks ≠ situs yang diajukan asli ≠ klirens terpenuhi.** Ketiganya diperiksa terpisah.

---

## Bab 2. Panduan Mahasiswa

1. Menu **Permohonan Mahasiswa** → **Permohonan baru**.
2. Isi judul artikel, nama jurnal, ISSN, dan **alamat web jurnal** persis seperti yang Anda gunakan untuk mengirim naskah.
3. Unggah dokumen pendukung bila diminta (surat penerimaan, bukti pembayaran, dsb.).
4. Kirim. Status permohonan dapat dilihat di halaman yang sama.
5. Setelah disetujui, surat tersedia di **Surat Klirens** dan dapat diunduh sebagai PDF. Surat memuat **kode QR** untuk verifikasi keaslian.

Jika permohonan ditolak atau ditahan, alasan ditampilkan. Mahasiswa dapat memperbaiki data dan mengajukan ulang.

---

## Bab 3. Panduan Peninjau

### 3.1 Investigasi jurnal baru

1. Menu **Investigasi Jurnal Baru**.
2. Ketik judul atau ISSN. Jika jurnal ada di database Scopus yang sudah diimpor, saran muncul otomatis (autocomplete).
3. Masukkan alamat web yang diajukan (bila ada).
4. Jalankan. Aplikasi memeriksa: ISSN (termasuk digit pemeriksa), kecocokan penerbit, DOAJ dan Crossref (langsung, bila tersedia), data Scopus yang diimpor, daftar rujukan lain, dan anomali (misalnya domain mencurigakan, klaim indeks tanpa bukti).
5. Hasil muncul di halaman investigasi dengan **alasan per temuan** dan tautan bukti.

### 3.2 Journal Passport

**Journal Passport** adalah profil satu jurnal: identitas, bukti terkumpul, alamat situs yang pernah dinilai, dan riwayat penilaian. Buka dari menu **Journal Passport**. Semua perubahan tercatat di **Riwayat Penilaian**.

### 3.3 Tinjauan Bukti

Menu **Tinjauan Bukti** berisi bukti yang butuh keputusan manusia (laporan belum terverifikasi, konflik antar-sumber). Untuk tiap bukti:

- **Terima** bila Anda dapat memverifikasinya (cantumkan sumber/alasan),
- **Tolak** bila terbukti salah,
- **Tahan** bila belum cukup.

Setiap tindakan dicatat dengan nama dan waktu. Jangan menerima bukti hanya karena "terlihat meyakinkan".

### 3.4 Mengusulkan keputusan

Dari halaman investigasi atau permohonan, pilih rekomendasi dan tulis alasan. Usulan masuk ke **Persetujuan Tertunda** untuk Kepala Unit.

### 3.5 Validasi Dunia Nyata

Menu **Validasi Dunia Nyata** dipakai untuk menguji ketepatan aplikasi: Anda mencatat kasus nyata, hasil aplikasi, dan hasil penilaian manual yang independen. Tujuannya mengukur kesesuaian sebelum aplikasi diandalkan. Saat ini jumlah kasus validasi nyata masih nol; target pilot ditentukan di `docs/REAL_WORLD_VALIDATION.md`.

---

## Bab 4. Panduan Kepala Unit Publikasi

1. Menu **Persetujuan Tertunda** menampilkan usulan yang menunggu.
2. Baca ringkasan, bukti, dan alasan. Pastikan empat penilaian (Bab 1.4) konsisten.
3. **Setujui**, **Tolak**, atau **Kembalikan** dengan catatan.
4. Setelah disetujui, surat PDF dibuat otomatis dengan nomor, tanda tangan sesuai pengaturan, dan kode QR verifikasi.
5. Aplikasi menerapkan aturan konservatif: bila ada ketidakpastian, aplikasi **tidak** merekomendasikan persetujuan otomatis.

Halaman **Pengaturan & Kebijakan** memuat aturan penilaian. Ubah hanya setelah rapat tim; setiap perubahan dicatat.

---

## Bab 5. Panduan Administrator

### 5.1 Akun pengguna

Pembuatan akun massal dilakukan lewat skrip, bukan lewat layar:

```bash
cp docs/templates/tim-pmu-akun.csv ~/akun-tim.csv     # isi email dan peran
npm run users:bulk -- ~/akun-tim.csv                  # uji coba (tidak menulis apa pun)
npm run users:bulk -- ~/akun-tim.csv --apply          # benar-benar membuat akun
```

Kata sandi acak ditulis ke berkas lokal berizin 600. Bagikan lewat saluran aman dan minta pengguna menggantinya. Jangan menaruh berkas itu di repositori.

### 5.2 Pencadangan

```bash
npm run pilot:backup -- /lokasi/aman/backup-$(date +%F)
```

Mencadangkan database dan dokumen beserta manifest sha256. Simpan di lokasi terenkripsi. Uji pemulihan sebelum pilot dimulai (lihat `docs/PILOT_RUNBOOK.md`).

### 5.3 Berkas `.env` penting

| Variabel | Fungsi |
|---|---|
| `DATABASE_URL` | Lokasi database |
| `SESSION_SECRET` | Rahasia sesi (acak, panjang; jangan dibagikan) |
| `APP_MODE` | `DEMO` atau `PILOT` |
| `DISABLE_EXTERNAL_LOOKUPS` | Isi `1` untuk mematikan DOAJ/Crossref; **kosongkan** agar pencarian langsung berjalan |

### 5.4 Logo

Logo UNHAS ada di `public/branding/logo-unhas.png`. Untuk mengganti, timpa berkas itu (PNG/JPG; SVG tampil di layar tetapi tidak masuk PDF), lalu muat ulang aplikasi.

---

## Bab 6. Melengkapi database rujukan

Aplikasi memeriksa jurnal terhadap beberapa **sumber rujukan**. Halaman **Sumber Rujukan** menampilkan status tiap sumber. Status **"Belum pernah terbukti hidup"** berarti uji koneksi belum pernah berhasil, bukan berarti sumber itu kosong.

### 6.1 Cara kerja tiap sumber

| Sumber | Cara masuk | Keadaan saat ini |
|---|---|---|
| **Scopus (daftar sumber, Excel)** | Impor berkas (menu **Database Scopus**) | Siap. Perlu Anda unggah berkas resmi |
| **DOAJ** | Pencarian langsung per ISSN lewat API DOAJ; cadangan: impor CSV DOAJ (`npm run doaj:import`) | **Teruji hidup 28 Nov 2026** (`pilot:smoke`, HTTP 200); lihat 6.2 |
| **Crossref** | Pencarian langsung per ISSN lewat API Crossref | **Teruji hidup 28 Nov 2026** (HTTP 200) |
| **SCImago (CSV)** | Impor CSV (kuartil, SJR) | Tersedia di menu impor rujukan |
| **Daftar Beall / jurnal dibajak (hijacked)** | Impor CSV | Tersedia; **Anda yang menyediakan dan bertanggung jawab atas daftarnya** |
| **SINTA** | Bukti manual (dicatat oleh Peninjau) | Tidak ada integrasi otomatis |
| **Bukti manual** | Peninjau menambahkan lewat halaman jurnal | Selalu tersedia |

### 6.2 DOAJ: yang benar-benar terjadi

**Penting:** DOAJ diperiksa **satu per satu jurnal, langsung ke API DOAJ, berdasarkan ISSN**, saat investigasi dijalankan. Salinan seluruh daftar DOAJ bersifat opsional dan hanya menjadi cadangan (lihat di bawah).

Langkah di Mac Anda (yang punya internet):

```bash
cd ~/claude_andiimam/journal-detective      # sesuaikan lokasi
git pull
grep DISABLE_EXTERNAL_LOOKUPS .env          # harus kosong atau tidak ada
npm run pilot:smoke
```

`pilot:smoke` mencoba DOAJ dan Crossref dengan ISSN uji. Jika berhasil, status di halaman **Sumber Rujukan** berubah dari "Belum pernah terbukti hidup" menjadi hidup, dengan waktu uji. Jika gagal, pesan kegagalan (jaringan, diblokir, dsb.) ditampilkan; kirimkan pesan itu untuk dianalisis.

Hasil uji pada 28 Nov 2026 dari lingkungan pengembangan: `pilot:smoke` berhasil untuk DOAJ dan Crossref (HTTP 200). Titik akhir `https://doaj.org/api/search/journals/issn:XXXX-XXXX` dan versi `/api/v4/search/journals/...` sama-sama menjawab; dokumentasi DOAJ v4 masih menyebut jalur tanpa versi. Crossref: `https://api.crossref.org/journals/{ISSN}` menjawab 404 untuk ISSN yang tidak ada. Anda tetap perlu menjalankan `pilot:smoke` di jaringan Anda sendiri, karena jaringan kampus bisa berbeda.

**Impor CSV DOAJ (tersedia).** DOAJ menyediakan CSV seluruh jurnal di `https://doaj.org/csv` (±26 MB, ±23.600 jurnal). Berkas ini terlalu besar untuk menu unggah (batas 12 MB), jadi diimpor lewat Terminal:

```bash
curl -L -o ~/doaj.csv https://doaj.org/csv
npm run doaj:import -- ~/doaj.csv --version "DOAJ CSV Nov 2026" --date 2026-11-28
```

Gunakan tanggal unduh sebagai `--date`. Cara kerjanya:
- Pencarian langsung ke API DOAJ tetap yang utama. **Impor hanya dipakai bila pencarian langsung tidak tersedia** (jaringan mati, dibatasi, atau dinonaktifkan).
- Hasil dari impor ditandai **IMPORTED_DATA** beserta versi dan tanggal datanya, tidak pernah ditulis sebagai "langsung".
- **Ada pada impor** → terdaftar di DOAJ menurut data bertanggal itu. **Tidak ada pada impor** → hanya "tidak konklusif", bukan bukti negatif.
- Impor DOAJ lengkap yang baru menggantikan yang lama (yang lama dinonaktifkan, riwayat tetap tersimpan). Ulangi tiap beberapa bulan.

### 6.3 Scopus: langkah impor

1. Unduh daftar sumber Scopus resmi (Excel) dari situs Elsevier.
2. Masuk sebagai Administrator atau Kepala Unit → **Database Scopus**.
3. Unggah berkas. Aplikasi menampilkan **pratinjau**: jumlah baris per lembar, kolom yang terdeteksi, dan baris bermasalah (ISSN tidak valid, dsb.).
4. Periksa pratinjau, lalu **Konfirmasi**. Impor lama tidak dihapus; ditandai digantikan.
5. Setiap hasil menyebut: "berdasarkan impor <bulan tahun>". Data yang lebih tua dari impor terbaru harus dibaca dengan hati-hati.

Uji sederhana setelah impor: cari "Scientific Reports". Hasil yang benar: Source ID 21100200805, E-ISSN 2045-2322, Active, 2011–2026, Nature Research / Springer Nature.

### 6.4 Urutan yang disarankan

1. Jalankan `npm run pilot:smoke` → DOAJ dan Crossref hidup.
2. Impor daftar Scopus.
3. (Opsional) Impor SCImago bila butuh kuartil.
4. (Opsional) Impor daftar Beall/hijacked yang **Anda** pilih dan dokumentasikan sumbernya.
5. Jalankan beberapa jurnal yang sudah Anda kenal (satu terkenal, satu meragukan) dan bandingkan hasilnya secara manual.
6. Catat hasilnya di **Validasi Dunia Nyata**.

### 6.5 Cakupan dan batasan

- Tidak ada satu sumber pun yang lengkap. Hasil "tidak ditemukan" harus dibaca sebagai **belum terverifikasi**.
- Daftar jurnal predator/dibajak sering berubah dan diperdebatkan. Aplikasi memperlakukannya sebagai **sinyal**, bukan putusan.
- Metrik (SJR, kuartil) tidak sama dengan kualitas satu artikel.

---

## Bab 7. Membaca hasil dengan benar

| Jika Anda melihat | Artinya | Tindakan |
|---|---|---|
| Terindeks Scopus, **Active** | Dalam daftar cakupan terakhir yang diimpor | Tetap periksa alamat situs yang diajukan |
| **Inactive** | Cakupan Scopus berhenti | Periksa tanggal; bukan otomatis "buruk" |
| **Tidak ditemukan** | Tidak ada di data yang kami miliki | Cari bukti manual sebelum memutuskan |
| Domain berbeda dari situs resmi | Kemungkinan tiruan | Konfirmasi dengan penerbit; bila terbukti, tandai blokir keras |
| Sumber **UNAVAILABLE** | Sumber tidak dapat dijangkau | Ulangi nanti; jangan anggap lolos |
| **CONFLICTED** | Sumber bertentangan | Tinjau manual di **Tinjauan Bukti** |

---

## Bab 8. Alur kerja harian dan sebelum pilot

**Harian:** mahasiswa mengajukan → Peninjau investigasi dan meninjau bukti → Peninjau mengusulkan → Kepala menyetujui → surat terbit.

**Daftar periksa sebelum PILOT:**

- [ ] `npm run pilot:smoke` berhasil untuk DOAJ dan Crossref di jaringan Anda
- [ ] Daftar Scopus terbaru sudah diimpor dan diuji
- [ ] Akun tim dibuat, kata sandi sementara sudah diganti
- [ ] Pencadangan dan **pemulihan** sudah diuji
- [ ] `SESSION_SECRET` acak dan unik; `.env` tidak ada di repositori
- [ ] Minimal beberapa kasus nyata dicatat di Validasi Dunia Nyata dan hasilnya ditinjau
- [ ] Mode diganti ke PILOT dengan database baru (bukan database DEMO)

---

## Bab 9. Pemecahan masalah

| Masalah | Penyebab umum | Solusi |
|---|---|---|
| Tidak bisa masuk setelah pembaruan | Server lama masih berjalan dengan database lama | Hentikan server lama, jalankan ulang |
| Seed gagal di instalasi baru | `.env` dibuat setelah `npm ci` | Buat `.env`, lalu `npx prisma generate` |
| DOAJ/Crossref "Tidak tersedia" | Uji koneksi belum berhasil, atau `DISABLE_EXTERNAL_LOOKUPS` terisi | Bab 6.2 |
| Logo tidak tampil | Berkas tidak ada di `public/branding/` | Pastikan `logo-unhas.png` ada, muat ulang |
| Impor Scopus lambat | Berkas besar (≈100.000 baris, ±6 detik, memori ±550 MB) | Tunggu; tutup aplikasi lain |
| Port 3000 terpakai | Proses lain | Jalankan dengan port lain atau hentikan proses itu |

Untuk pembaruan di Mac: `git pull`, `npm ci`, `npx prisma generate`, `npm run db:migrate`, lalu mulai ulang aplikasi. Jangan menjalankan `db:reset` pada data PILOT.

---

## Lampiran. Daftar istilah

- **Journal Passport**: profil bukti dan riwayat satu jurnal.
- **Host**: alamat web persis (misalnya `jurnal.contoh.ac.id`) tempat naskah dikirim.
- **Klirens**: persetujuan administratif PMU untuk menerbitkan di jurnal tertentu.
- **Blokir keras**: situs tiruan yang sudah terkonfirmasi; tidak dapat dikliren.
- **Bukti**: satu temuan dengan sumber, waktu, dan status.
- **Impor**: unggahan berkas rujukan (Scopus, SCImago, dst.) dengan pratinjau dan riwayat.

Dokumen teknis terkait: `docs/ASSESSMENT_POLICY.md`, `docs/DATA_SOURCES.md`, `docs/SCOPUS_IMPORT.md`, `docs/PILOT_RUNBOOK.md`, `docs/DEPLOYMENT.md`, `docs/REAL_WORLD_VALIDATION.md`.
