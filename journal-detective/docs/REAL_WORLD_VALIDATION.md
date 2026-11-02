# Validasi Dunia Nyata — metode dan status

## Dua jenis validasi yang dipisahkan
1. **Validasi perangkat lunak** — apakah kode mengikuti aturan yang dirancang (tes unit/layanan/E2E, fixture **fiktif**). Dilaporkan di `PHASE_1B_REPORT.md`.
2. **Validasi dunia nyata** — apakah rekomendasi cocok dengan penilaian manual independen atas jurnal & situs **nyata**. Hanya terjadi di ruang **Validasi Dunia Nyata** dengan kasus nyata. Fixture fiktif tidak pernah dihitung.

## STATUS SAAT INI
**Validasi dunia nyata: BELUM DILAKUKAN.** Jumlah kasus nyata dengan referensi manual dan perbandingan: **0 dari 10–20 yang ditargetkan.** Tidak ada klaim akurasi. Alasan: tidak ada kasus nyata, bukti otoritatif independen, atau penilaian manual petugas yang disediakan pada pekerjaan ini. Seluruh 10 skenario berstatus **NOT RUN / AWAITING MANUAL REFERENCE** sampai petugas memasukkannya.
(Pada mode DEMO terdapat 4 fixture fiktif berlabel "FIKTIF — bukan validasi nyata" untuk memperagakan alur.)

## Metode (diterapkan oleh modul)
- **Anti-anchoring:** referensi manual dikunci sebelum aplikasi dijalankan; hasil aplikasi tidak ditampilkan sebelum proses dijalankan.
- **Penguncian:** setiap proses menyimpan snapshot bukti (id, status, integrasi, sumber, tanggal data/ambil, tinjauan), versi & hash kebijakan, versi aplikasi/mesin, dan snapshot permohonan bila ditautkan. Proses lama tidak pernah diubah; proses ulang = baris baru. Revisi referensi = versi baru.
- **Dimensi:** identitas jurnal, tujuan, administratif, akhir (masing-masing boleh *tidak dinilai*).
- **Perbedaan:** diklasifikasikan (aplikasi terlalu longgar/ketat, celah bukti, konflik sumber, cacat aturan, perbedaan tafsir kebijakan, kesalahan referensi, lainnya); *aplikasi lebih longgar pada tujuan/akhir/jurnal saat referensi MERAH* = **kritis keselamatan** (penghalang pilot).
- **Uji ulang:** hasil `RESOLVED` / `STILL_DISAGREES` terhubung ke proses sebelumnya.
- **Ekspor CSV:** satu baris per proses; kolom konfidensialitas; tanpa narasi secara bawaan; narasi hanya Kepala Unit; formula-injection dinetralkan; diaudit; `no-store`.

## Panduan cakupan 10 skenario (cari kasus NYATA)
| # | Skenario | Yang perlu Anda siapkan secara independen |
|---|---|---|
| 1 | Jurnal sah, indeksasi terverifikasi, situs otentik | Bukti Scopus Sources (tanggal), halaman penerbit |
| 2 | Jurnal sah, bukti penerimaan tidak lengkap | Permohonan nyata tahap Diterima dengan dokumen kurang |
| 3 | Situs klon terkonfirmasi | Konfirmasi independen (mis. Retraction Watch Hijacked Journal Checker/penerbit) + URL otentik |
| 4 | Indeksasi dihentikan, kebijakan mewajibkan aktif | Bukti Scopus: status tidak aktif + tahun akhir |
| 5 | Kecocokan Beall historis tanpa pelanggaran terkini | Daftar Beall (impor sendiri), penilaian transparansi terkini |
| 6 | Bukti indeksasi tidak tersedia | Jurnal tanpa data Scopus yang dapat diakses |
| 7 | Penerimaan sah tanpa revisi | Riwayat editorial nyata (disamarkan) |
| 8 | Dokumen penerimaan sah untuk tujuan klon | Kasus nomor 3 dengan permohonan tahap Diterima |
| 9 | Migrasi domain sah / platform eksternal | Pernyataan penerbit tentang migrasi/platform |
| 10 | Bukti saling bertentangan/kedaluwarsa | Dua impor/sumber yang berbeda atau data lama |
Catatan: jangan memasukkan identitas atau dokumen rahasia ke ekspor; gunakan pseudonim dan dokumen tersamar.

## Kriteria untuk menyatakan "validasi dunia nyata lulus" (belum terpenuhi)
Ditetapkan oleh pejabat sebelum menjalankan, mis.: ≥ 10 kasus nyata mencakup semua 10 skenario; **nol** kasus *kritis keselamatan* yang belum terselesaikan; semua perbedaan terklasifikasi dan diuji ulang; referensi dicatat sebelum proses. Ambang kesepakatan tidak ditentukan oleh sistem.
