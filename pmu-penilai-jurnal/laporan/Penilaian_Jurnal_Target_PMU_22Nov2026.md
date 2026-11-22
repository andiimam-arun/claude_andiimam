# Penilaian Risiko Jurnal Target — PMU FKM Unhas

Tanggal: 22 November 2026 | Disusun untuk: Ketua PMU
Sumber data: Scopus Source List Oktober 2026 (file project `ext_list_Oct_2026.xlsx`), Scimago (SJR 2025, angka dokumen bersumber dari Scopus, snapshot Maret 2026), catatan manual Anda dari dua lampiran, dan pencarian web untuk verifikasi situs resmi.

---

## 0. Batasan data (baca dulu)

1. **Scopus.com tidak saya buka** (perlu login institusi). Pengganti: Source List Oktober 2026 untuk status Active/Inactive/Discontinued, dan Scimago untuk jumlah dokumen per tahun. [Pasti]
2. **Scimago hanya sampai tahun 2025** (snapshot Maret 2026). Angka 2026 dari Scopus.com harus dicek manual untuk jurnal Kuning dan Merah. Penurunan atau penghentian indexing yang terjadi tahun 2026 tidak terlihat di sini. [Pasti]
3. **Cek kloning/hijack**: saya memverifikasi situs resmi, ISSN, dan penerbit lewat sumber publik. Saya **belum mencocokkan dengan daftar Retraction Watch Hijacked Journal Checker** dan belum memeriksa URL submit yang dipakai mahasiswa, kecuali dua jurnal yang URL-nya Anda cantumkan. [Pasti]
4. Skor C1 (kecepatan proses) dan C2 (rekam jejak terbit) memakai catatan Anda. Banyak jurnal tidak punya datanya, sehingga tidak dinilai (n/a). [Pasti]
5. Ambang batas skor dan pita rasio di bawah adalah **usulan saya**, belum dikalibrasi dengan data historis PMU. [Menebak]

---

## 1. Rubrik penilaian (100 poin)

Ketentuan: `Skor akhir = poin diperoleh ÷ poin yang bisa dinilai × 100`. Jika poin yang bisa dinilai < 70, hasilnya "belum dapat disimpulkan".

### A. Status dan legitimasi (40 poin)

| Kode | Indikator | Poin | Cara menilai |
|---|---|---|---|
| A1 | Status Active di Scopus Source List terbaru, tidak ada di sheet Discontinued (**gerbang**) | 15 | Active dan tidak di Discontinued = 15. Inactive/Discontinued = 0 dan otomatis MERAH |
| A2 | Ada di Scimago dengan SJR dan kuartil tahun terakhir | 5 | Ada = 5, tidak ada = 0 (Scimago tertinggal setahun untuk jurnal baru, jadi bukan gerbang) |
| A3 | Kuartil Scimago | 5 | Q1/Q2 = 5, Q3/Q4 = 3 |
| A4 | Bukan kloning/hijack (**gerbang**) | 15 | 15 = domain terverifikasi (cocok dengan homepage Scimago/penerbit, atau di platform penerbit besar). 12 = situs resmi dan ISSN terkonfirmasi, URL submit belum dicek. 8 = hanya ISSN/penerbit konsisten di Scopus. 0 = terindikasi kloning → MERAH |

### B. Kewajaran volume dan pola (35 poin)

| Kode | Indikator | Poin | Cara menilai |
|---|---|---|---|
| B1 | Stabilitas jumlah dokumen Scopus, 3 rasio tahunan terakhir (r = N_t / N_t−1) | 15 | Normal: 0,7 ≤ r ≤ 1,5. Sedang: 0,5–0,7 atau 1,5–2,0. Ekstrem: r < 0,5 atau r > 2,0. Semua normal = 15; satu sedang = 11; dua sedang atau satu ekstrem = 6; dua ekstrem = 0. Tambah satu hitungan "sedang" bila turun > 60% dari puncak 5 tahun. Jurnal < 30 dokumen/tahun dinilai dari selisih absolut (normal bila ≤ 10 dokumen) |
| B2 | Kesesuaian jumlah dokumen di website vs Scopus (tahun yang sudah lengkap) | 10 | Scopus/web ≥ 0,8 = 10; 0,6–0,8 = 6; 0,4–0,6 = 3; < 0,4 = 0 |
| B3 | Self-citation (self cites ÷ total cites, tahun terakhir) | 10 | ≤ 15% = 10; 15–25% = 7; 25–40% = 3; > 40% = 0 |

### C. Proses dan rekam jejak (25 poin)

| Kode | Indikator | Poin | Cara menilai |
|---|---|---|---|
| C1 | Kewajaran waktu submit → accepted | 10 | ≥ 42 hari = 10; 28–41 hari = 6; < 28 hari = 2. LOA terbit ≤ 7 hari sejak hasil review = tanda bahaya |
| C2 | Rekam jejak terbit nyata (mahasiswa/dosen FKM) | 10 | ≥ 2 kasus terbit = 10; 1 kasus = 7; submit tapi belum ada yang terbit (< 6 bulan) = 3; ≥ 3 kasus tanpa terbit setelah > 6 bulan = 0 |
| C3 | Kontinuitas coverage dan terbitan | 5 | Coverage sampai tahun berjalan, tanpa jeda = 5; jeda tahun atau coverage melewati tahun berjalan = 2–3 |

### Ambang keputusan

| Kategori | Syarat |
|---|---|
| **HIJAU — Aman submit** | Skor ≥ 80, A1 lolos, **A4 ≥ 12**, tidak ada flag |
| **KUNING — Verifikasi dulu** | Skor 60–79, atau skor ≥ 80 tetapi ada salah satu flag kuning di bawah |
| **MERAH — Tunda/hindari** | Skor < 60, atau kena flag merah |

**Flag merah (otomatis MERAH):** R1 tidak Active atau ada di Discontinued; R2 terindikasi kloning; R3 jumlah dokumen turun > 80% dalam satu tahun, atau lonjakan > 2× diikuti runtuh; R4 ≥ 3 kasus submit > 6 bulan tanpa satu pun terbit.
**Flag kuning (maksimal KUNING):** K1 satu rasio volume ekstrem; K2 self-citation > 50%; K3 coverage melewati tahun berjalan; K4 A4 belum terverifikasi (< 12); K5 LOA tercatat < 28 hari sejak submit.

---

## 2. Hasil penilaian 10 jurnal

| # | Jurnal | Skor | Dinilai dari | Hasil |
|---|---|---|---|---|
| 1 | Asia Pacific Journal of Health Management | 85 | 100 | **HIJAU** (catatan B2) |
| 2 | Acta Medica Philippina | 74 | 100 | **KUNING** |
| 3 | Journal of Health and Human Services Administration | 94 | 80 | **HIJAU** |
| 4 | Indian Journal of Tuberculosis | 93 | 80 | **HIJAU** |
| 5 | Frontiers in Public Health | 100 | 70 | **HIJAU** (data belum lengkap) |
| 6 | Nutrición Clínica y Dietética Hospitalaria | 73 | 70 | **KUNING** |
| 7 | Indian Journal of Entomology | 83 | 70 | **KUNING** (A4 belum terverifikasi, K3) |
| 8 | Journal of Evaluation in Clinical Practice | 89 | 80 | **KUNING ringan** (K1) |
| 9 | Pan African Medical Journal | 74 | 80 | **KUNING** |
| 10 | Current Topics in Nutraceutical Research | 69 | 70 | **MERAH** (R3) |

### Data kunci: dokumen per tahun (Scopus via Scimago)

| Jurnal | 2022 | 2023 | 2024 | 2025 | Kuartil 2025 | Self-cite 2025 |
|---|---|---|---|---|---|---|
| APJHM | 74 | 89 | 112 | 141 | Q4 | 18% (35/191) |
| Acta Medica Philippina | 292 | 158 | 293 | 222 | Q4 | 8% (31/381) |
| J Health Hum Serv Admin | 11 | 16 | 14 | 8 | Q4 | 16% (5/32) |
| Indian J Tuberculosis | 141 | 102 | 127 | 247 | Q3 | 6% (29/457) |
| Frontiers in Public Health | 5.227 | 4.929 | 4.008 | 4.942 | Q1 | 5% (3.019/60.719) |
| Nutr Clín Diet Hosp | 78 | 88 | 170 | 225 | Q4 | 54% (130/240) |
| Indian J Entomology | 231 | 274 | 269 | 247 | Q3 | 9% (46/487) |
| J Eval Clin Pract | 145 | 157 | 191 | 551 | Q2 | 4% (44/1.020) |
| Pan African Med J | 924 | 543 | 552 | 414 | Q3 | 1% (23/1.913) |
| Curr Top Nutraceutical Res | 86 | 78 | 170 | **9** | Q4 | 3% (3/104) |

Semua 10 jurnal berstatus **Active** di Scopus Source List Oktober 2026 dan **tidak ada** di sheet Discontinued Titles. Tidak ada yang lolos dari gerbang A1.

### Rincian poin per jurnal

| # | A1 | A2 | A3 | A4 | B1 | B2 | B3 | C1 | C2 | C3 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 15 | 5 | 3 | 15 | 15 | 3 | 7 | 10 | 7 | 5 | 85 / 100 |
| 2 | 15 | 5 | 3 | 15 | 6 | 10 | 10 | 2 | 3 | 5 | 74 / 100 |
| 3 | 15 | 5 | 3 | 15 | 15 | 10 | 7 | n/a | n/a | 5 | 75 / 80 |
| 4 | 15 | 5 | 3 | 15 | 11 | 10 | 10 | n/a | n/a | 5 | 74 / 80 |
| 5 | 15 | 5 | 5 | 15 | 15 | n/a | 10 | n/a | n/a | 5 | 70 / 70 |
| 6 | 15 | 5 | 3 | 12 | 11 | n/a | 0 | n/a | n/a | 5 | 51 / 70 |
| 7 | 15 | 5 | 3 | 8 | 15 | n/a | 10 | n/a | n/a | 2 | 58 / 70 |
| 8 | 15 | 5 | 5 | 15 | 6 | 10 | 10 | n/a | n/a | 5 | 71 / 80 |
| 9 | 15 | 5 | 3 | 12 | 6 | n/a | 10 | n/a | 3 | 5 | 59 / 80 |
| 10 | 15 | 5 | 3 | 12 | 0 | n/a | 10 | n/a | n/a | 3 | 48 / 70 |

---

## 3. Temuan per jurnal dan tindak lanjut

**1. APJHM — HIJAU.** Volume naik teratur (74 → 89 → 112 → 141), URL `journal.achsm.org.au` cocok dengan penerbit ACHSM dan email kontak di Scimago. Kasus mahasiswa Januari → terbit April 2026 membuktikan siklus penuh. Satu hal tidak cocok: catatan Anda "web 104, Scopus 48" bertentangan dengan Scimago yang menunjukkan 141 dokumen untuk 2025. [Menebak] angka 48 adalah hitungan 2026 yang belum terindeks penuh. Pastikan tahun yang dibandingkan. Skor B2 = 3 mengikuti catatan Anda; jika ternyata itu 2026, skor naik ke sekitar 92.

**2. Acta Medica Philippina — KUNING.** Volume bergoyang tajam (292 → 158 → 293 → 222). Rasio 0,54 dan 1,85 membuat B1 hanya 6. Selisih submit → accepted 26 hari (termasuk satu revisi) lebih cepat dari pita wajar, dan beberapa mahasiswa lain belum ada yang terbit. Situs `actamedicaphilippina.upm.edu.ph` cocok dengan penerbit UP Manila. Tindakan: tanyakan ke mahasiswa yang pernah submit sudah berapa bulan menunggu. Jika ≥ 3 kasus > 6 bulan tanpa terbit, naik ke MERAH (R4).

**3. J Health and Human Services Administration — HIJAU.** Platform SAGE, coverage 1994–2026, self-cite wajar. Output hanya 8 dokumen pada 2025, jadi satu tahun buruk mudah memicu re-evaluasi. Tidak ada tanda itu saat ini. [Kemungkinan Besar] aman untuk satu siklus submit.

**4. Indian J Tuberculosis — HIJAU.** Dokumen 2025 hampir dua kali lipat (127 → 247, rasio 1,94, batas ekstrem 2,0), berada di zona sedang. Self-cite 6%, Medline-sourced, Q3. Cek jenis dokumen 2025 (apakah ada supplement konferensi).

**5. Frontiers in Public Health — HIJAU, data belum lengkap.** Active, Q1, volume stabil, self-cite 5%. B2 (web vs Scopus) belum dicek. Jawaban atas pertanyaan "masih bisa?": ya, berdasarkan data Oktober 2026, tidak ada tanda diskontinyu. Volume sangat besar (~4–5 ribu/tahun) sehingga risikonya ada pada penolakan dan biaya, bukan status Scopus. [Kemungkinan Besar]

**6. Nutrición Clínica y Dietética Hospitalaria — KUNING.** Self-citation 54% pada 2025 dan 38% pada 2024, bersamaan dengan lonjakan volume 88 → 170 → 225. Pola ini kuat sebagai sinyal kutipan internal yang mendongkrak metrik. Situs resmi `revista.nutricion.org` (SEDCA, ISSN 1989-208X) terkonfirmasi, jadi bukan soal kloning. Tindakan: pertimbangkan jurnal lain jika target Anda butuh dampak kutipan nyata. Risiko diskontinyu Scopus [Menebak] menengah, karena self-citation tinggi adalah salah satu kriteria re-evaluasi Scopus.

**7. Indian J Entomology — KUNING.** Pertanyaan Anda "terbitan sudah sampai akhir 2027" valid: Source List mencatat coverage **2019–2027** pada Oktober 2026, artinya ada isi bertanggal 2027 yang sudah diindeks. [Kemungkinan Besar] ini janggal untuk jurnal yang secara historis terbit terlambat, bukan lebih awal. Volume dan self-cite normal. Tindakan: buka daftar isi terbaru di situs resmi (tanggal terbit tiap issue) dan konfirmasi domain, lalu naikkan ke HIJAU bila konsisten. Cek juga kecocokan cakupan topik dengan naskah.

**8. J Evaluation in Clinical Practice — KUNING ringan.** Saya tidak setuju dengan penilaian "oke" pada catatan Anda karena Scimago mencatat 551 dokumen pada 2025, hampir tiga kali dari 191 pada 2024. Ini yang akan saya lakukan sebagai gantinya: cek komposisi tipe dokumen 2025 di Scopus.com (artikel vs abstrak/supplement). Risikonya: lonjakan 2,9× yang tidak dijelaskan bisa memicu re-evaluasi, meski Wiley, Medline, dan Q2 membuat risiko diskontinyu rendah. [Kemungkinan Besar] ini abstrak konferensi atau special issue.

**9. Pan African Medical Journal — KUNING.** Tanda merah Anda didasarkan pada ketiadaan artikel mahasiswa yang terbit. Data tidak menunjukkan risiko diskontinyu: situs resmi aktif (artikel bertanggal Oktober 2026), Active di Scopus, self-cite 1%. Yang bermasalah adalah **peluang diterima** dan **tren output**: 1.147 (2020) → 414 (2025), turun 64%. Laporan tahunan PAMJ 2025 menyebut penerimaan kurang dari 1 dari 10 submission dan waktu ke publikasi sangat bervariasi. Tindakan: jangan jadikan jurnal utama untuk mahasiswa dengan tenggat kelulusan.

**10. Current Topics in Nutraceutical Research — MERAH.** Dokumen Scopus: 170 (2024) → **9 (2025)** → 2 (2026, catatan Anda). Ini runtuh 95%, didahului lonjakan 2,2×, dan ada jeda 0 dokumen pada 2017. Status masih Active, tetapi pola "naik tajam lalu berhenti" konsisten dengan judul yang ditahan (on hold) Scopus sebelum diputuskan. [Kemungkinan Besar] Tentang proses: Anda mencatat submit 17 September, review 13 Oktober, LOA sudah terbit di Oktober. Tanggal LOA persis tidak ada, jadi C1 tidak dinilai. [Menebak] percepatan itu abnormal. Tindakan: jangan submit sebelum jumlah dokumen 2026 di Scopus.com dicek. Bila naskah sudah accepted, simpan bukti korespondensi dan siapkan jurnal pengganti.

---

## 4. Catatan untuk rubrik ke depan

1. Indikator "Ada di Scopus" (#2 permintaan Anda) dan "Ada di list (context)" (#5) merujuk ke sumber yang sama, yaitu Scopus Source List. Saya gabungkan menjadi A1 dan pecah menjadi tiga cek: status Active, tidak di Discontinued, dan coverage sampai tahun berjalan.
2. Tambahan saya: self-citation (B3), kuartil (A3), rekam jejak mahasiswa (C2), kecepatan proses (C1), dan kontinuitas coverage (C3).
3. Kelemahan terbesar rubrik ini: **tidak melihat 2026**. Untuk Kuning/Merah, tambahkan kolom "dokumen 2026 YTD di Scopus.com" dan bandingkan dengan proporsi tahun berjalan.
4. Ambang batas perlu dikalibrasi dengan 10–20 jurnal yang sudah terbukti aman (misal yang sudah dipakai dosen FKM dan terbit) dan beberapa yang sudah didiskontinyu, sebelum dipakai sebagai kebijakan PMU.

---

## 5. Pembaruan rubrik: dokumen tahun berjalan (22 November 2026)

Indikator B1 diperluas dengan satu rasio tambahan: **dokumen tahun berjalan di Scopus.com (sampai hari ini) ÷ dokumen tahun penuh terakhir**. Data ini tidak ada di Scimago dan harus diambil dari Scopus.com (Sources, pilih jurnal, Documents by year).

| Rasio tahun berjalan | Efek |
|---|---|
| ≥ 2,0 (sudah dua kali lipat padahal tahun belum selesai) | Dihitung ekstrem pada B1 dan **flag merah R5** |
| 1,5–2,0 | Dihitung sedang pada B1 |
| < 0,25 (dan tahun penuh terakhir ≥ 30 dokumen) | Dihitung sedang pada B1 dan flag kuning K6 |
| 0,25–1,5 | Normal |

Contoh: 90 dokumen (2024), 102 (2025), 500 (2026 sampai November) memberi rasio 4,9 dan hasil MERAH. Jurnal kecil (di bawah 30 dokumen per tahun) dinilai dari selisih absolut, bukan rasio. Penyebab sah lonjakan tetap ada (special issue, supplement konferensi, perubahan sistem terbit), sehingga R5 berarti tunda dan cek komposisi dokumen, bukan bukti kloning. Skor 10 jurnal di bagian 2 tidak berubah karena data 2026 belum tercatat untuk jurnal-jurnal itu.

## 6. Kalibrasi pada jurnal discontinued dan kontrol (22 November 2026)

**Metode.** Sepuluh jurnal dipilih dari sheet Discontinued Titles (Source List Oktober 2026) dan dinilai mundur seolah masih aktif, memakai data Scimago tahun sebelum pencoretan. Lima kontrol sehat dari kelompok BMJ, BMC dan IJAMH dinilai dengan data 2025. Quartile tidak ikut dinilai, sehingga semua skor berstatus sementara dan hanya bermakna sebagai perbandingan.

| Kelompok | HIJAU | KUNING | MERAH |
|---|---|---|---|
| Discontinued (10 jurnal) | 3 | 7 | 0 |
| Kontrol sehat (5 jurnal) | 4 | 1 | 0 |

**Temuan.**
- Tiga jurnal discontinued lolos HIJAU (American Journal of Health Behavior, African Journal of Biomedical Research, Journal of Biological Regulators and Homeostatic Agents): volume dan self-citation tampak normal. [Pasti] angkanya; [Kemungkinan Besar] pencoretannya didorong faktor lain.
- Tujuh jurnal terflag KUNING, umumnya K1 (lonjakan atau penurunan ekstrem). Bali Medical Journal juga terflag K2 (self-citation 28% menjadi 50%).
- MERAH tidak pernah muncul pada snapshot retrospektif. Peringatan awal hanya berupa KUNING.
- Satu false positive pada kontrol: International Journal of Adolescent Medicine and Health (dokumen 209 menjadi 51 pada 2021-2023, lalu stabil).

**Keputusan.** Ambang 80/60 dan aturan flag tidak diubah, karena sampel terlalu kecil dan pengetatan akan menambah false positive. HIJAU diartikan sebagai "tidak ada sinyal risiko dari data volume dan legitimasi", bukan "aman dari discontinued". Kandidat flag baru yang belum dimasukkan: kenaikan self-citation lebih dari 15 poin persentase antar tahun (baru satu kasus, [Menebak]).

