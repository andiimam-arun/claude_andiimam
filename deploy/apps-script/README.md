# Menayangkan Peta Riset di Google Apps Script (Aplikasi Web)

Ini cara cepat membuat dasbor bisa dibuka lewat satu tautan `script.google.com/...`, tanpa peladen. Cocok untuk uji coba dan berbagi sementara; untuk glori.unhas.ac.id
tetap yang utama adalah memasang folder `site/peta-riset` di situs itu (atau menyematkan tautan Apps Script di halaman GloRI lewat iframe).

## Yang perlu diketahui sebelum mulai
- Halaman dan datanya **publik** bila akses diatur "Anyone". Datanya sama dengan yang tampil di dasbor (nama, TRG, keahlian, artikel); tidak ada email atau data kontak.
- Akun Google Workspace unhas.ac.id mungkin **melarang akses "Anyone"** dari luar organisasi. Bila pilihan itu tidak muncul, pilih "Anyone within Universitas Hasanuddin", atau pakai akun Google pribadi untuk penayangan publik.
- Aplikasi ini **tidak memakai layanan Google apa pun**, jadi tidak ada layar izin (OAuth).
- Datanya berukuran sekitar 2,5 MB. **Belum diuji di Apps Script sungguhan**: saya hanya menguji rakitan yang sama di peramban lokal. Kalau unggahan atau waktu muat bermasalah, kabari saya dan saya pangkas datanya.
- Peta dan tab lain memakai tautan keluar (OpenAlex, DOI) yang terbuka di tab baru; fitur yang memerlukan alamat URL internal (menyimpan filter di URL) tidak berubah di dalam iframe Apps Script, tetapi parameter pada tautan web app (`?tab=dunia&lang=en`) dibaca.

## Langkah (disarankan: `clasp`, karena berkas data besar)
1. Bangun paket: `python3 scripts/build_apps_script.py --out dist/apps-script` (butuh Python 3). Atau pakai zip yang saya kirim, yang sudah berisi hasilnya.
2. Aktifkan Apps Script API: buka https://script.google.com/home/usersettings lalu nyalakan "Google Apps Script API".
3. Pasang clasp (butuh Node.js): `npm install -g @google/clasp`, lalu `clasp login` (masuk dengan akun yang akan memiliki aplikasinya).
4. Ambil **Script ID** proyek Anda (proyek kosong "Untitled project" di tangkapan layar boleh dipakai): di editor, ikon roda gigi (Project Settings), bagian IDs.
5. Di folder hasil bangun, buat berkas `.clasp.json` berisi `{"scriptId": "ID_ANDA", "rootDir": "."}` (ada contohnya: `.clasp.json.contoh`), lalu jalankan `clasp push --force`.
   Berkas `Untitled.gs` bawaan akan tergantikan oleh `Code.gs`.
6. Di editor: **Deploy → New deployment → Web app**. Pilih "Execute as: Me" dan "Who has access: Anyone" (atau sesuai catatan di atas), lalu **Deploy**. Salin URL yang berakhiran `/exec`.
7. Buka URL itu. Contoh dengan parameter: `URL/exec?lang=en`, `URL/exec?tab=dunia`, `URL/exec?embed=1` (menyembunyikan bilah atas, untuk disematkan).

## Memperbarui data
Jalankan ulang pembaruan data (`scripts/trg_refresh.py`), lalu `python3 scripts/build_apps_script.py --out dist/apps-script`, `clasp push --force`, dan di editor **Deploy → Manage deployments → ikon pensil → Version: New version → Deploy**.
URL `/exec` tidak berubah bila Anda memperbarui deployment yang sama (jangan membuat deployment baru).

## Alternatif tanpa clasp (hanya bila perlu)
Di editor, tambahkan berkas HTML bernama persis `Index`, `Css`, `Config`, `Data`, `App` (tombol **+ → HTML**) dan tempel isi berkas dengan nama sama dari folder hasil bangun; `Code.gs` ditempel ke berkas skrip, dan
`appsscript.json` lewat Project Settings → "Show appsscript.json manifest file in editor". Menempel `Data.html` (2,5 MB) lewat peramban bisa lambat atau gagal; bila begitu, gunakan clasp.
