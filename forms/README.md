# Formulir kelengkapan data TRG

Satu berkas xlsx per TRG (`forms/trg/Formulir_TRG_<slug>.xlsx`), sudah terisi dari data situs trg.unhas.ac.id.
Abu-abu = periksa dan koreksi, kuning = isi. `forms/index_formulir.csv` mengurutkan TRG menurut banyaknya
masalah data, sehingga yang paling perlu dilengkapi muncul di atas.

Alur: kirim berkas ke koordinator tiap TRG, kumpulkan yang sudah diisi di satu folder, lalu jalankan
`python3 scripts/trg_forms_collect.py FOLDER` untuk menghasilkan CSV isian di `data/trg/formulir_masuk/`.
Formulir dibuat ulang dengan `python3 scripts/trg_forms.py` (jalankan setelah crawl baru).
