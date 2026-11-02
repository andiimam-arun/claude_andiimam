# Sumber Data & Integrasi

Status integrasi dalam aplikasi: `LIVE_VERIFIED`, `IMPORTED_DATA`, `MANUAL_EVIDENCE`, `UNAVAILABLE`, `ERROR`. Sumber yang tidak tersedia ditampilkan apa adanya dan **tidak pernah** diganti data demonstrasi.

| Sumber | Mekanisme | Status nyata | Catatan lisensi/batasan |
|---|---|---|---|
| Scopus Source List | Impor CSV/XLSX oleh Admin/Kepala (tanggal, versi, asal-usul, sha256 dicatat) | Berfungsi (data impor, *historis*) | Gunakan hanya berkas yang diperoleh sah sesuai lisensi Elsevier. Tidak pernah disebut verifikasi langsung. "Tidak ditemukan" = tidak konklusif. |
| Scopus Serial Title API | `scopusApi.ts`, aktif bila `SCOPUS_API_KEY` | Titik ekstensi, **belum diuji langsung** | Butuh kunci berlisensi/entitlement; status diturunkan dari tahun cakupan → wajib konfirmasi manusia. |
| SCImago | Impor CSV (`;` didukung) atau bukti manual | Berfungsi (impor/manual) | Tanpa scraping/akses terproteksi. Bukti historis pelengkap, bukan status Scopus saat ini. |
| DOAJ | API publik `doaj.org/api/search/journals/issn:` | Kode ada; **tidak diverifikasi hidup di lingkungan pembangunan** (jaringan terbatas). Gagal → UNAVAILABLE/ERROR | Patuhi batas laju & ketentuan DOAJ. Absen dari DOAJ bukan bukti penipuan. |
| Crossref | REST API `api.crossref.org/journals/{issn}` | Idem | DOI ≠ kualitas. Cantumkan `mailto` kontak bila memakai pool sopan (rekomendasi produksi). |
| Retraction Watch Hijacked Journal Checker | Tidak ada API terautorisasi dipakai | Pemeriksaan **manual** terdokumentasi atau impor daftar bila diizinkan | Tanpa scraping. Kecocokan impor tetap butuh konfirmasi manusia. |
| Beall's List (historis) | Tidak dibundel; impor mandiri | Opsional | Historis, tidak dipelihara; hanya pemicu tinjauan. |
| Akreditasi nasional (mis. SINTA) | Bukti manual | Manual | Tidak ada scraping portal. |
| COPE, Think. Check. Submit. | Kerangka rujukan; bukti manual | Manual | Keanggotaan COPE bersifat pendukung. |
| Pengambilan halaman situs diajukan | Aksi eksplisit peninjau via `safeFetch` | Berfungsi | Anti-SSRF; isi halaman = data tidak tepercaya. |
| LLM (Anthropic) | `ai.ts`, opsional `ANTHROPIC_API_KEY` | Opsional, belum diuji langsung | Hanya ringkasan penasihat; teks tak tepercaya dipagari; tidak memengaruhi status. |

Format impor dikenali otomatis (nama kolom tidak peka huruf): `Source Title/Title`, `Print-ISSN/ISSN`, `E-ISSN`, `Active or Inactive`, `Publisher's Name`, `Sourceid`, `SJR Best Quartile`, `Year`, `Authentic URL`, `Hijacked URL`, `Note`. ISSN yang kehilangan nol depan dipulihkan hanya bila checksum sah.

Data pada `fixtures/` **fiktif** (ISSN 9900-xxxx, domain `.example`) dan berlabel demonstrasi.


## Matriks status integrasi (Fase 1B — jujur)
Empat keadaan dibedakan: **Diimplementasikan** (kode ada) · **Teruji dengan fixture terkendali** (tes otomatis, BUKAN layanan sungguhan) · **Terbukti hidup** (permintaan nyata berhasil dan hasil diperiksa) · **Tidak tersedia di lingkungan ini**.

| Sumber | Diimplementasikan | Fixture terkendali | Terbukti hidup | Catatan lingkungan pembangunan |
|---|---|---|---|---|
| Scopus Source List (impor CSV/XLSX, tanpa kunci API) | Ya | Ya: CSV, XLSX, struktur/identifier/tanggal ditolak, impor lama vs baru, usang | Tidak berlaku (berkas) — **belum ada berkas Scopus nyata yang diimpor** | Operator mengimpor berkas sah (runbook §3) |
| Scopus Serial Title API | Ya (kode) | **Tidak** | **Tidak** | Tanpa kunci; tidak dibutuhkan pilot |
| DOAJ API | Ya | Ya: sukses, kosong, timeout, 429, 403, 5xx, respons rusak, bentuk tak dikenal, dinonaktifkan | **Tidak** | Egress menolak `doaj.org` (CONNECT 403); `pilot:smoke` mencatat FAILED |
| Crossref REST API | Ya | Ya (sama) | **Tidak** | Egress menolak `api.crossref.org` (CONNECT 403) |
| SCImago | Impor CSV/manual (tanpa integrasi langsung, tanpa scraping) | Ya (fixture fiktif) | Tidak berlaku | — |
| Retraction Watch Hijacked Journal Checker | Impor daftar (bila diizinkan) / temuan manual | Ya (fixture fiktif) | Tidak ada integrasi | Pemeriksaan manual terdokumentasi |
| Beall (historis) | Impor (tidak dibundel) | Ya (fixture fiktif) | Tidak berlaku | — |
| Pengambilan beranda situs (safeFetch) | Ya (aksi eksplisit peninjau) | Hanya pagar SSRF (unit) | **Tidak** | Egress dibatasi |
| LLM eksternal | Ya, terkunci (butuh 3 variabel operator) | Tidak | Tidak | Nonaktif secara bawaan |

Bukti kegagalan hidup (2026-11-02, sandbox): `curl https://doaj.org/api/search/journals/issn:1932-6203` → `CONNECT tunnel failed, response 403`; idem Crossref. `npm run pilot:smoke` → `FAILED DOAJ/Crossref: tidak dapat diakses`. Kebijakan egress menolak host tersebut; tidak ada upaya melewati kontrol akses dan tidak ada hasil pengganti.
Klasifikasi galat adapter: batas laju (HTTP 429 + Retry-After), akses ditolak (401/403), galat server (5xx), waktu habis, respons bukan JSON, bentuk respons tak dikenal → seluruhnya `UNAVAILABLE`/`ERROR`. Hasil kosong (DOAJ `results: []`, Crossref 404) → `NOT_FOUND` **tanpa** implikasi penipuan.
Smoke test operator: `npm run pilot:smoke` (runbook §9).
