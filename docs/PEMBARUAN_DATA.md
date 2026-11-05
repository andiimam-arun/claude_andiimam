# Model pembaruan data Peta Riset Unhas

Data peta riset berubah terus: anggota TRG berganti, artikel baru terbit, ketua mengoreksi profilnya. Model ini menjaga agar
pembaruan **tidak menimpa koreksi manusia** dan **tidak merusak situs publik** bila sumbernya berubah.

## Empat lapis dan urutan menangnya

```
 sumber otomatis  <  isian formulir  <  koreksi manual         (yang kanan menang)
 crawl / ekspor        data/forms →       data/overrides/*.csv
 + OpenAlex/Crossref   *.form.csv
        └────────────────────────── semuanya → data situs (JSON) → API / halaman
```

| Lapis | Berkas dan perintah | Siapa | Kapan |
|---|---|---|---|
| 1. Sumber otomatis | `scripts/trg_crawl.py`; pengayaan `scripts/trg_enrich.py` | Admin GloRI | Bulanan |
| 2. Koreksi manual | `data/overrides/*.csv` (lihat README di folder itu) | Admin GloRI, koordinator fakultas | Kapan saja |
| 3. Formulir berkelanjutan | `scripts/trg_forms_ingest.py` (xlsx atau JSON dari portal) | Ketua TRG | Tiap semester |
| 4. API untuk situs | `docs/api/openapi.yaml`, `scripts/trg_api_server.py` | Pengembang situs | Otomatis |

Aturan emas: **jangan menyunting `data/trg/*.csv` atau JSON situs dengan tangan.** Semuanya dibuat ulang. Perbaikan selalu masuk
lewat override atau formulir, sehingga bertahan pada putaran berikutnya.

## Satu perintah pembaruan

```
BIBLIO_MAILTO=alamat@unhas.ac.id python3 scripts/trg_refresh.py --cache /jalur/cache --enrich
```

Menjalankan: crawl, olah isian di `data/forms/masuk/`, pengayaan bibliografi (opsional), dedup + override, tema, laporan kelengkapan,
data situs, wawasan, dan uji kontrak API. **Berhenti bila uji kontrak gagal**, agar data rusak tidak sampai ke situs.
Hasil akhirnya `data/perubahan/AAAA-MM-HH.md`: orang baru dan hilang, ketua yang berubah, TRG yang jumlah anggotanya turun tajam
(tanda parser gagal). **Admin membaca laporan ini sebelum mengunggah data ke situs.** Tanpa crawl: `--skip-crawl`.

## Lapis 1: sumber otomatis

- **Sekarang:** membaca halaman publik trg.unhas.ac.id. Ini rapuh karena tiap TRG memakai tata letak berbeda.
  Peringatan dini: laporan perubahan menandai TRG yang anggotanya turun >30%.
- **Target:** ekspor resmi dari admin platform TRG. Platform tidak membuka API publik untuk tim, artikel, dan proyek
  (endpoint `jet-cct` terkunci). Yang perlu diminta ke admin: akses baca (token) ke tabel JetEngine `trg`, `our_team`, `articles`,
  `books`, `patents`, `projects` atau ekspor CSV terjadwal, dengan kolom yang sudah ada di halaman. Ini menghapus ketergantungan pada parser.
- **Pengayaan** (`--enrich`): artikel dicocokkan ke OpenAlex lewat DOI (dipercaya penuh), Crossref bila OpenAlex tidak punya, dan lewat judul
  hanya bila kemiripan ≥ 0,92 dan tahun berbeda ≤ 1. Hasil: sitasi, FWCI, 10% teratas, akses terbuka, jurnal. Untuk peneliti ber-ORCID:
  jumlah karya, sitasi, h-index. ORCID divalidasi (format + checksum); yang salah dicatat di `data/trg/orcid_bermasalah.csv`.
  Hanya sekitar 41% baris artikel punya DOI, jadi cakupan pencocokan perlu dilihat di `data/trg/enrich_log.csv` (kolom `cakupan_pct`).
  Metrik kualitas tampil di halaman hanya untuk tema dengan ≥ 10 artikel tercocok.
- Alamat email kontak untuk "polite pool" OpenAlex/Crossref diambil dari variabel lingkungan `BIBLIO_MAILTO`, tidak ditulis di kode.

### Pakar Unhas dari OpenAlex (institusi I98301867)

`--enrich` mencocokkan artikel yang sudah kita punya. Skrip berikut sebaliknya: menarik **semua penulis berafiliasi Unhas** dari OpenAlex,
lalu mencocokkannya ke peneliti TRG. Tujuannya menemukan pakar yang belum ada di TRG manapun dan menambah metrik (h-index, sitasi, bidang).

```
OPENALEX_API_KEY=... BIBLIO_MAILTO=... python3 scripts/trg_openalex_unhas.py --cache /jalur/cache/openalex          # tarik (uji: --max-halaman 1)
python3 scripts/trg_openalex_match.py                                                                              # cocokkan + data situs
# atau semuanya: python3 scripts/trg_refresh.py --skip-crawl --openalex --cache /jalur/cache
```

- **Kunci API wajib.** OpenAlex membatasi akses tanpa kunci dengan kuota harian yang dibagi per alamat IP; di lingkungan bersama kuota itu cepat habis.
  Kunci gratis dibuat di openalex.org dan dikirim lewat header (tidak masuk URL maupun cache).
- **Urutan kecocokan:** ORCID sama, lalu Scopus ID sama, lalu nama sama (urutan kata bebas, minimal 2 kata). Kecocokan nama yang ambigu
  tidak dipakai; masuk `data/openalex/tinjau.csv`. Cara membereskannya: tambahkan ORCID orang itu lewat `data/overrides/profil_orang.csv`.
- **Hasil:** `data/openalex/pakar_openalex.csv` (semua penulis + status), `site/peta-riset/data/openalex.json`. Tab "Pakar di luar TRG" dan baris
  metrik di kartu peneliti hanya muncul bila berkas itu ada.
- **Afiliasi:** default memakai afiliasi terakhir (orang yang kini di Unhas); `--semua-afiliasi` juga mengambil yang pernah berafiliasi.
- **Keterbatasan:** profil penulis OpenAlex dibuat otomatis; nama Indonesia sering terpecah atau tergabung. Daftar "di luar TRG" adalah petunjuk
  yang perlu diverifikasi, bukan data resmi. Ambang tampil: minimal 5 karya (`--min-karya`).

### Kuartil jurnal (Q1-Q4)

OpenAlex tidak memuat kuartil; kuartil berasal dari SJR (SCImago). `scripts/trg_kuartil.py` menghitung artikel jurnal Unhas per tahun dari OpenAlex
(`data/openalex/jurnal_unhas.csv`) dan menggabungkannya dengan berkas SJR yang Anda unduh dari scimagojr.com:

```
OPENALEX_API_KEY=... python3 scripts/trg_kuartil.py --cache /jalur/cache --sjr 2023=scimagojr_2023.csv --sjr 2024=scimagojr_2024.csv
```

Hasil: `kuartil_unhas.csv` (Q1-Q4 per tahun) dan `jurnal_tanpa_kuartil.csv` (jurnal terbanyak yang tidak ditemukan di SJR; periksa ini sebelum angka dilaporkan).
Satuan: artikel dengan minimal satu penulis berafiliasi Unhas, hitung utuh. Penyebut kecocokan peneliti TRG adalah semua orang unik (2.842, termasuk mahasiswa).

## Lapis 2: koreksi manual

Enam berkas CSV (`ketua`, `orang_gabung`, `orang_pisah`, `tema_trg`, `kata_kunci`, `profil_orang`). Setiap baris memuat `alasan`, `oleh`, `tanggal`.
Setelah pipa berjalan, `data/trg/override_laporan.txt` menyebut baris yang berlaku dan baris yang tidak cocok dengan data
(mis. nama sudah berubah), sehingga koreksi yang usang terlihat. Konfirmasi atau pencabutan 16 ketua yang diduga
(`data/trg/ketua_diduga.csv`) dilakukan lewat `ketua.csv`.

## Lapis 3: formulir berkelanjutan

- **Kontrak:** `schemas/profil_trg.schema.json` (contoh: `profil_trg.contoh.json`). Satu pengiriman = profil lengkap satu TRG:
  anggota (peran, ID, maksimal 3 tema keahlian, kata kunci), tema TRG, mitra, riset unggulan, **pendanaan 5 tahun**, kesediaan konsorsium.
  Pendanaan dan kesediaan konsorsium adalah data yang saat ini paling menentukan keputusan konsorsium atau institut, tetapi belum ada di sumber mana pun.
- **Dua pintu, satu pengolah:** formulir xlsx per TRG (`forms/trg/`, sekarang versi 2) atau JSON dari portal. Keduanya divalidasi,
  disimpan di `data/forms/riwayat.jsonl` (hanya menambah), dan isian terbaru menjadi `*.form.csv` di `data/overrides/`.
  Isian yang ditolak (ORCID salah, tema lebih dari 3, slug tidak dikenal) masuk `data/forms/ditolak.csv` dengan alasannya.
- **Penanda terverifikasi:** TRG yang sudah mengirim isian tampil "Terverifikasi <tanggal>" di Daftar TRG; yang belum tampil "Belum diverifikasi ketua TRG".
  Ini alasan bagi ketua untuk mengisi. Disarankan membuat TRG yang tidak mengonfirmasi dalam 12 bulan kembali ke status belum terverifikasi.
- **Anggota baru:** orang yang ditambahkan ketua di formulir masuk sebagai anggota TRG itu, lalu digabung dengan baris lain lewat ID atau nama.

## Lapis 4: API untuk situs

`docs/api/openapi.yaml` (OpenAPI 3.1, tervalidasi). Baca publik: `/meta`, `/peneliti`, `/peneliti/{id}`, `/trg`, `/trg/{slug}`, `/tema`, `/wawasan`.
Tulis dengan token: `GET/POST /trg/{slug}/profil` (profil awal untuk formulir web, dan pengiriman profil). Bentuk datanya sama dengan berkas JSON
di `site/peta-riset/data/`, jadi tahap awal cukup menyajikan berkas itu, dan backend dinamis menyusul tanpa mengubah antarmuka.
`scripts/trg_api_server.py` adalah implementasi rujukan yang diuji (`scripts/tests/test_api.py`); `scripts/trg_api_check.py`
memeriksa data terhadap skema sebelum rilis. Token tidak boleh berada di halaman publik: portal memanggil API dari sisi server.

## Siklus dan tanggung jawab yang disarankan

| Kapan | Apa | Siapa |
|---|---|---|
| Bulanan | `trg_refresh.py`, baca laporan perubahan, unggah data ke situs | Admin GloRI |
| Kuartalan | Tinjau `override_laporan.txt`, kasus dedup di `peneliti_review.csv`, TRG tanpa ketua | Admin + koordinator fakultas |
| Semester | Ketua TRG memeriksa dan mengirim ulang profil; ingat tenggat | Ketua TRG, dipantau GloRI |
| Tahunan | Tinjau taksonomi tema dan daftar kata awan kata kunci | Tim GloRI |

Cadangkan folder `data/overrides/`, `data/forms/`, dan `data/snapshots/`: itu satu-satunya data yang tidak dapat dibuat ulang dari sumber otomatis.

## Keterbatasan yang perlu diketahui

- Pengayaan bibliografi **belum diuji terhadap API nyata** (jaringan sesi pengembangan memblokir OpenAlex, Crossref, dan ORCID). Alurnya diuji dengan server tiruan
  (`scripts/tests/test_enrich.py`); jalankan sekali dengan `--limit 200` dan periksa `enrich_log.csv` sebelum putaran penuh.
- SINTA dan Scopus tidak diakses (perlu izin atau kunci); ID mereka hanya dipakai sebagai identitas.
- API rujukan tidak punya pembatasan laju maupun TLS; versi produksi harus menambahkannya.
- Pencocokan orang masih berbasis nama dan ID, bukan identitas pasti; `orang_gabung`/`orang_pisah` adalah jalan keluarnya.

### Peta kolaborasi global

`scripts/trg_openalex_negara.py` menarik, dari OpenAlex, negara tempat penulis rekan Unhas berafiliasi (dengan institusi mitra teratas per negara), dan
`scripts/trg_map_geo.py` membuat jalur SVG peta dunia dari TopoJSON `world-atlas` (domain publik Natural Earth; perlu paket `pycountry` hanya saat membangun).
Hasilnya `site/peta-riset/data/kolaborasi.json` dan `dunia.json`; tab "Kolaborasi global" hanya muncul bila keduanya ada. Karya dengan 50 penulis atau lebih
dikeluarkan; satu karya dihitung sekali per negara, jadi angka antar-negara tidak boleh dijumlahkan. Dijalankan juga oleh `trg_refresh.py --openalex`.

### Output Unhas dan mitra institusi

`scripts/trg_openalex_luaran.py` menarik luaran Unhas secara keseluruhan dari OpenAlex: artikel per tahun (dengan bagian akses terbuka), komposisi kuartil per tahun
(dari `kuartil_unhas.csv`), bidang riset, SDG, dan institusi mitra luar dan dalam negeri. Hasil: `site/peta-riset/data/luaran.json` (tab "Output Unhas"; daftar mitra tampil di tab peta).
`trg_openalex_negara.py` kini juga menyimpan karya terpilih per negara (8 paling banyak dikutip, 5 terbaru) dengan lencana kuartil bila `--sjr TAHUN=BERKAS` diberikan.
Catatan: "akses terbuka" menurut OpenAlex mencakup salinan di repositori; satu jurnal dominan dalam setahun (mis. suplemen konferensi) dapat memiringkan komposisi kuartil, dan halaman menandainya.
