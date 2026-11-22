# Penilai Jurnal PMU (FKM Unhas)

Rubrik 100 poin untuk menyaring jurnal target: risiko discontinued Scopus, volume tidak wajar, dan jurnal kloning.

- `laporan/` laporan rubrik, hasil 10 jurnal, dan kalibrasi (Bagian 6). Format .md dan .doc.
- `app/index.html` antarmuka satu halaman; `app/logic.js` logika skor murni (`evaluate`, `parseScimago`).

## Catatan
- Aplikasi membaca `journals.json` (daftar jurnal dari Scopus Source List Oktober 2026). File itu **sengaja tidak disertakan** karena data Source List berlisensi Elsevier; hasilkan sendiri dari file xlsx resmi (kolom: id, judul, ISSN, EISSN, status, flag discontinued, coverage, publisher).
- HIJAU berarti "tidak ada sinyal risiko dari data volume dan legitimasi", bukan jaminan aman. Pada kalibrasi, 3 dari 10 jurnal discontinued masih HIJAU.
- Ambang (80/60) dan aturan flag adalah usulan dan belum divalidasi pada sampel besar.
