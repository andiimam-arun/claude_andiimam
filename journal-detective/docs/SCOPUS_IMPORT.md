# Impor Database Referensi Scopus (workbook Source List)

Tujuan: mengimpor workbook Scopus Source List **satu kali**, lalu mencari jurnal dengan nama/ISSN dan memeriksanya **tanpa memasukkan bukti indeksasi satu per satu**.
Menu: **Database Scopus** (`/sources/scopus`). Impor hanya untuk Administrator/Kepala Unit; pencarian untuk semua staf.

## Yang harus Anda klik
1. Unduh workbook di browser (mis. `ext_list_Sep_2026.xlsx`). Aplikasi tidak mengunduh sendiri.
2. Masuk sebagai `admin@jd.example` (DEMO) → **Database Scopus** → *Langkah 1*: pilih berkas, label versi (`September 2026`), tanggal pengamatan, URL asal → **Unggah & buat pratinjau**. Tunggu (berkas besar: beberapa menit), biarkan halaman terbuka.
3. *Langkah 2 — Pratinjau (belum disimpan)*: periksa sheet & baris header yang terdeteksi, pemetaan kolom, jumlah baris valid, duplikat, konflik, kesalahan, nilai kolom "Titles Discontinued by Scopus". Lalu **Konfirmasi & simpan impor** (atau **Batalkan**: tidak ada yang tersimpan).
4. Cari: nama (`Scientific Reports`), ISSN (`2045-2322` atau `20452322`), atau Source ID. Klik hasil untuk detail. **Periksa jurnal ini** membuka Investigasi dengan identitas terisi. Pada *Investigasi Jurnal Baru* dan formulir permohonan, mengetik nama/ISSN memunculkan saran (autocomplete).
Alternatif Terminal (berkas besar): `npm run scopus:import -- /jalur/ext_list_Sep_2026.xlsx --version "September 2026" --date 2026-09-01 --url <URL> [--yes]` (tanpa `--yes` hanya membuat pratinjau).

## Perilaku
- **Header dideteksi dari nama kolom** pada ~25 baris pertama tiap sheet (bukan nomor baris tetap): Sources (baris 1), Discontinued (baris 2), Accepted (baris 3) didukung, begitu pula pembaruan berikutnya selama nama kolom serupa. Peran sheet dari nama sheet ("Sources", "Discontinued", "Accepted") atau dari kolomnya; sheet lain (mis. catatan/ASJC) diabaikan dan dilaporkan. Kolom tak dikenal disimpan sebagai data tambahan.
- **Identifier = teks**: Source ID, Print-ISSN, E-ISSN disimpan apa adanya (nol di depan dan huruf `X` dipertahankan). Kunci pencarian 8 karakter tanpa tanda hubung; sel ISSN numerik yang kehilangan nol dipulihkan **hanya** bila digit pemeriksa sah. Pencarian ISSN menerima format dengan/ tanpa tanda hubung dan mencari **kedua** kolom (Print-ISSN dan E-ISSN).
- **Disimpan**: Active/Inactive, Coverage (+tahun awal/akhir), kolom "Titles Discontinued by Scopus", Source Type, Publisher, grup penerbit, negara, ASJC, Open Access, sheet asal.
- **Inactive ≠ dihentikan karena kualitas.** Penanda kualitas hanya bila kolom "Titles Discontinued by Scopus" terisi (nilai bukan "no/0/-/kosong"); nilai yang ada ditampilkan di pratinjau untuk Anda periksa.
- **Penggabungan Discontinued** memakai Source ID (lalu ISSN/E-ISSN bila unik). Indexation Change dan final coverage (tahun, volume, issue, halaman) dipertahankan. **Konflik ditandai** (mis. *Active* pada Sources tetapi ada di Discontinued; judul berbeda; Source ID berbeda; kecocokan ambigu; Source ID duplikat dengan isi berbeda) dan menghasilkan bukti berstatus KONFLIK (perlu tinjauan).
- **Accepted Titles = status tersendiri** ("diterima untuk proses penambahan"), **bukan** aktif terindeks; mesin keputusan menganggapnya belum memenuhi indeksasi aktif.
- **Riwayat**: setiap impor menyimpan URL asal, nama berkas, SHA-256, versi, tanggal pengamatan, waktu impor, pengimpor. Impor baru menggantikan yang lama untuk pencarian/penilaian; yang lama dipertahankan (SUPERSEDED). Penilaian lama dan Journal Passport tidak pernah diubah atau dihapus.
- **Terpisah dari Journal Passport**: impor tidak membuat Passport. Passport dibuat saat jurnal **diperiksa**.
- **Label**: semua hasil "berdasarkan impor Scopus <versi>" (IMPORTED_DATA, tanggal pengamatan), bukan verifikasi langsung. *Tidak ditemukan dalam impor = belum terverifikasi*, bukan tidak terindeks.
- **Batas**: indeksasi dari impor **tidak** membuktikan situs pengiriman autentik dan **tidak** memberi klirens akhir; tujuan dan administratif dinilai terpisah.
- Impor generik lama (CSV/XLSX di *Sumber Rujukan*) tetap ada; data fiktif demo tetap dipakai hanya bila jurnal tidak ada di workbook.

## Status verifikasi (jujur)
- Workbook asli **tidak dapat diunduh** dari lingkungan pengembangan (egress diblokir), sehingga importer **belum diuji pada berkas asli**. Pengujian memakai workbook **sintetis** dengan struktur yang Anda jelaskan (3 sheet, header baris 1/2/3 + sheet pembuka) dan satu baris Scientific Reports berisi nilai yang Anda berikan (hanya pada fixture uji). Nama kolom asli diperkirakan dari format publik Scopus; **pratinjau menampilkan pemetaan sebenarnya**. Jika ada kolom penting tidak terpetakan, kirimkan nama kolomnya agar alias ditambahkan.
- Uji performa sintetis: 100.000 baris × 13 kolom: baca ≈ 6 dtk (±550 MB RSS), stage + simpan ≈ 24 dtk, pencarian ≈ 25–40 ms.
