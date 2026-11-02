# Kebijakan Penilaian — bagaimana setiap keputusan diambil

Implementasi: `src/lib/engine/decision.ts`, `clearance.ts`, `approval.ts`. Semua aturan di sini diuji pada `tests/unit/engine.test.ts`.
Tidak ada skor numerik: hasil adalah aturan eksplisit + alasan yang ditampilkan. AI tidak memengaruhi status.

## 1. Catatan bukti
Setiap pemeriksaan menghasilkan catatan: pemeriksaan, temuan, status (VERIFIED / REPORTED_UNVERIFIED / NOT_FOUND / UNAVAILABLE / CONFLICTED),
sumber, URL/referensi dokumen, tanggal diambil, tanggal data sumber, kutipan, penjelasan, **keparahan** (INFO…CRITICAL), **kekuatan bukti** (STRONG…NONE; terpisah dari keparahan),
kebutuhan konfirmasi manusia, dan status integrasi (LIVE_VERIFIED, IMPORTED_DATA, MANUAL_EVIDENCE, UNAVAILABLE, ERROR).
Bukti bertanda "perlu konfirmasi" menunggu keputusan peninjau (CONFIRMED / DITOLAK) yang tersimpan terhadap sidik jari bukti dan bertahan lintas penilaian ulang.

## 2. Status jurnal
Urutan evaluasi:

**MERAH — integritas kritis** bila salah satu:
- situs diajukan = klon/dibajak **terkonfirmasi** (bukti manual VERIFIED, atau dugaan dari daftar rujukan/kemiripan yang dikonfirmasi peninjau) → juga `identityFraudBlock`;
- peniruan identitas terkonfirmasi (`hijack.identity_impersonation` VERIFIED);
- klaim Scopus terbukti salah: klaim ada **dan** "tidak terdaftar" *konklusif* (hanya dari verifikasi langsung atau bukti manual terverifikasi — **bukan** dari impor historis);
- indikator penerbitan KRITIS terverifikasi.

**MERAH — tidak memenuhi kebijakan** (bukan "predator") bila kebijakan aktif mewajibkan dan: cakupan Scopus *dihentikan* terverifikasi (dan penanganan = INELIGIBLE), atau tidak terdaftar konklusif, atau kuartil wajib tidak terpenuhi dengan bukti terverifikasi. Akreditasi nasional yang diterima kebijakan dapat memenuhi syarat indeksasi.

**KUNING** bila ada hal tak terselesaikan: identitas belum dikorroborasi / ada ketidaksesuaian; situs belum terverifikasi atau mencurigakan; indeksasi tak terverifikasi, tidak konklusif, kedaluwarsa (> `maxIndexEvidenceAgeDays`), bertentangan, atau "ditahan"; kecocokan Beall menunggu tinjauan (atau dikonfirmasi tetapi tanpa pelanggaran kritis); indikator keparahan sedang/tinggi terverifikasi; klaim indeksasi (Scopus/DOAJ/akreditasi) belum terverifikasi; kuartil diklaim berbeda; bukti menunggu konfirmasi manusia.

**HIJAU** hanya bila: identitas terkorroborasi **dan** situs otentik (cocok domain resmi dari sumber independen, atau migrasi sah terverifikasi) **dan** kelayakan kebijakan terpenuhi **dan** tidak ada alasan KUNING. Tanpa bukti lengkap tidak pernah HIJAU (pengaman `insufficient_evidence`).

Tidak pernah otomatis: Beall, tidak terdaftar Scopus, tidak ada di DOAJ, APC, domain baru, atau data tidak tersedia.

Domain resmi ditetapkan dari sumber independen (DOAJ live, daftar rujukan diimpor, bukti manual) — **tidak pernah** dari input mahasiswa. Perbandingan: cocok → MATCHES_OFFICIAL; ada pada kolom "Hijacked URL" → REPORTED_CLONE (butuh konfirmasi); berbeda → DIFFERENT_DOMAIN/LOOKALIKE (homoglif, jarak edit, varian tanda hubung, punycode) → butuh konfirmasi; tanpa domain resmi → UNAVAILABLE.

## 3. Klirens administratif (per tahap)
Dokumen wajib diambil dari kebijakan per tahap (pra-pengiriman bawaan: tidak ada — tidak menuntut bukti peristiwa yang belum terjadi). Putaran revisi **tidak** diwajibkan.
- HIJAU: semua dokumen wajib berstatus MET/NOT_APPLICABLE oleh peninjau dan tidak ada tanda terbuka.
- KUNING: dokumen belum ada/belum diverifikasi/tidak memenuhi; tanda ketidakkonsistenan atau anomali proses masih terbuka.
- MERAH: permohonan ditolak administratif setelah tinjauan terdokumentasi, atau peninjau **mengonfirmasi** tanda serius (keparahan sedang/tinggi). Tidak menyiratkan jurnal curang.
Tanda otomatis (judul/jurnal/ISSN/ID naskah/domain surel/tujuan pembayaran/tanggal tak cocok; penerimaan sangat cepat; urutan peristiwa) adalah petunjuk tinjauan, bukan bukti pemalsuan. Penerimaan cepat hanya peringatan kontekstual (LOW).

## 4. Rekomendasi akhir
- MERAH bila jurnal MERAH atau administratif MERAH → klirens **diblokir**.
- KUNING bila salah satu KUNING. HIJAU bila keduanya HIJAU.
- `hardBlock` (identitas palsu) **tidak dapat di-override**. MERAH kebijakan dapat di-override Kepala Unit **hanya** bila `headMayOverridePolicyIneligible` aktif dan dengan justifikasi ≥ 20 karakter. MERAH kritis/administratif tidak dapat di-override. Persetujuan non-HIJAU dicatat sebagai override (justifikasi, versi kebijakan, status sistem saat itu).

## 5. Persetujuan & surat
Aksi: Mulai tinjauan, Minta bukti tambahan, Kembalikan untuk revisi, Nilai ulang jurnal, Eskalasi, Rekomendasikan setuju/tolak (peninjau), **Setujui/Tolak (hanya Kepala Unit)**. Semua mencatat aktor, waktu, alasan, versi kebijakan.
Surat resmi: hanya Kepala Unit, hanya bila permohonan APPROVED dan tidak diblokir, dengan **nomor surat resmi yang diketik manusia**. Sebelum itu hanya draf berwatermark "DRAF — BELUM DISETUJUI". Tanda tangan hanya placeholder. Halaman QR publik menampilkan informasi minimum (jenis, nomor, tanggal, nama dimasking, jurnal, penerbit) dan tidak pernah membuka draf.

## 6. Kebijakan konfigurabel
Editor kebijakan (Pengaturan) menerbitkan **versi baru** (tidak menimpa) dengan catatan wajib; hanya Kepala Unit yang dapat menandai RESMI. Default: kebijakan DEMONSTRASI berlabel jelas. Parameter: Scopus wajib, penanganan dihentikan, akreditasi nasional, kuartil, umur bukti, dokumen per tahap, kunci eskalasi, tenggat tinjauan, interval penilaian ulang, ambang penerimaan cepat, override Kepala.
