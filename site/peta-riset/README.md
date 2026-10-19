# Peta Riset Unhas (halaman mandiri)

Direktori peneliti dan Thematic Research Group (TRG) Universitas Hasanuddin: cari ahli, peta tema, daftar TRG.
Satu folder statis (HTML, CSS, JavaScript, JSON). Tanpa build, tanpa database, tanpa pustaka luar. Dwibahasa ID/EN.
Tampilan mengikuti palet GloRI (navy `#1b2a5e`, merah `#c8102e`, emas `#c9973f`; font Jost).

## Isi folder

| Berkas | Fungsi |
|---|---|
| `index.html` | Halaman utama |
| `assets/css/peta.css` | Gaya. Variabel warna di `:root` memakai nama yang sama dengan `glori.css` |
| `assets/js/app.js` | Logika pencarian, tampilan, bahasa |
| `assets/js/config.js` | Pengaturan: tautan GloRI, email koreksi, bahasa awal |
| `assets/img/logo-glori.png` | Logo (disalin dari situs dummy; ganti dengan berkas resmi) |
| `data/peta-data.js` | Semua data dalam satu berkas JavaScript (dipakai halaman, termasuk saat dibuka dari berkas) |
| `data/*.json` | Data yang sama dalam JSON: `peneliti`, `trg`, `tag`, `meta` |

## Memasang di situs Laravel GloRI

1. Salin folder ini ke `public/peta-riset/` di proyek Laravel. Halaman terbuka di `/peta-riset/`.
2. Tautkan dari menu (misalnya di bawah "Riset & Publikasi" atau "Pusat Unggulan").
3. Sematkan di halaman yang sudah ada (opsional):
   ```html
   <iframe src="/peta-riset/?embed=1" title="Peta Riset Unhas" style="width:100%;height:1400px;border:0" loading="lazy"></iframe>
   ```
   `?embed=1` menyembunyikan bilah atas dan catatan kaki. Parameter lain: `lang=id|en`, `tab=cari|tema|trg`, `q=kata+kunci`.
4. Isi `assets/js/config.js` (email koreksi, tautan beranda).

Halaman juga bisa dibuka langsung dengan klik ganda `index.html` (tanpa server): data tertanam di `data/peta-data.js`.
Berkas JSON di `data/` tetap disertakan sebagai kontrak data dan untuk integrasi database.
Bila situs memakai Content-Security-Policy, izinkan `fonts.googleapis.com` dan `fonts.gstatic.com`, atau unggah Jost dan Roboto
ke folder sendiri dan ganti baris `<link>` font di `index.html`.

## Memperbarui data

Data dibuat dari halaman publik trg.unhas.ac.id oleh skrip di repositori:

```
python3 scripts/trg_crawl.py --out data/trg --cache CACHE_DIR
python3 scripts/trg_dedup_tags.py && python3 scripts/trg_tag_tier1.py && python3 scripts/trg_report.py
python3 scripts/trg_dashboard_data.py site/peta-riset/data --tanpa-mahasiswa
```

Lalu ganti folder `data/` di server (`peta-data.js` dan berkas JSON dibuat bersamaan). Data bersifat salinan per tanggal (`meta.json`), bukan data hidup.

## Kamus data

**`peneliti.json`** (satu baris per orang unik setelah deduplikasi; ketua TRG didahulukan)

| Kolom | Arti |
|---|---|
| `id` | ID internal (P00001, dst.) |
| `nama` | Nama kanonik (dari baris ketua bila ada) |
| `peran`, `ketua_di` | Peran di TRG; nama TRG yang dipimpin |
| `trg`, `trg_slugs`, `trg_n` | Nama TRG, slug (kunci ke `trg.json`), jumlah TRG |
| `klaster`, `tag_ids` | Klaster dan tema (kode ke `tag.json`); diwarisi dari TRG |
| `keahlian` | Keahlian yang tertulis di halaman TRG (teks bebas, sering kosong) |
| `sinta_id`, `scopus_id`, `orcid` | ID peneliti bila dicantumkan |

**`trg.json`**: `slug`, `nama`, `fakultas`, `klaster`, `tag_ids`, `ketua`, `n_peneliti`, `n_publikasi`, `n_buku`, `n_paten`, `n_proyek`, `url`, `masalah`.
**`tag.json`**: 38 tema Tingkat 1 (draf): `tag_id`, `nama` (ID), `name_en`, `klaster`, `n_trg`, `n_peneliti`, `n_publikasi`.
**`meta.json`**: tanggal pembuatan dan angka ringkasan.

## Integrasi database (tahap berikut)

Bila data dipindah ke database Laravel, cukup sediakan endpoint JSON dengan bentuk yang sama dan ubah fungsi `load()` di `app.js`
(`loadAll()`, yang memakai `window.PETA_DATA` bila ada dan `fetch` JSON bila tidak) agar memanggil endpoint itu, dan hapus tag `<script src="data/peta-data.js">`. Antarmuka tidak perlu diubah.

## Catatan kualitas data

- Data diambil otomatis dan dapat keliru. Dedup nama berdasarkan kemiripan nama, bukan identitas pasti.
- Keahlian kosong untuk sebagian peneliti; tema peneliti diwarisi dari TRG-nya, bukan dari keahlian pribadi.
- Mahasiswa tidak ditampilkan di versi publik (opsi `--tanpa-mahasiswa`). Email peneliti tidak pernah disertakan.
- Pemetaan tema adalah draf berbasis kata kunci nama TRG dan perlu ditinjau.
