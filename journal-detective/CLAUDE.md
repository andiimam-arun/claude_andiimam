# CLAUDE.md — Journal Detective

## Arsitektur
Next.js 15 (App Router) + TypeScript + Tailwind 3 + Prisma 6 (SQLite dev / PostgreSQL prod) + Recharts + pdf-lib. Semua kode di `journal-detective/` (repositori induk berisi proyek lain, jangan diubah).

```
src/lib/engine/     MURNI (tanpa I/O): types, decision (jurnal), clearance (administratif+akhir), approval (aturan peran/persetujuan/penerbitan),
                    domain, issn, extract, consistency, anomalies, policy, evidence
src/lib/services/   I/O: journalRegistry, reference (impor dataset), investigation (orkestrator 6 cek), hijack, externalSources (DOAJ/Crossref),
                    scopusApi (ekstensi), applications, documents, approval, letters, pdf, analytics, audit, policyService, settings, ai, siteSnapshot
src/lib/security/   safeFetch (SSRF), upload (magic bytes), sanitize (injeksi prompt)
src/lib/auth/       session (JWT cookie httpOnly + cek DB), permissions
src/lib/i18n/       dict (id/en), reasonText/actionText
src/app/(app)/      halaman terautentikasi; src/app/actions/ server actions; src/app/api/ unduhan terlindungi; src/app/verify/ publik
prisma/             schema, migrations, seed.ts (data FIKTIF)
tests/unit|e2e      vitest / playwright
```

## Aturan pengembangan (tidak boleh dilanggar)
1. **Mesin keputusan murni & berbasis aturan.** Tanpa AI, tanpa skor numerik. Perubahan aturan wajib memperbarui `docs/ASSESSMENT_POLICY.md` dan tes Case A–I.
2. **Data hilang ≠ bukti negatif.** UNAVAILABLE/NOT_FOUND-tidak-konklusif tidak pernah menjadi MERAH atau HIJAU. "Tidak ditemukan" pada impor historis selalu *tidak konklusif*.
3. **Jangan mengarang** hasil indeksasi, sumber, tautan, tanda tangan, persetujuan, atau nomor surat. Bukti manual VERIFIED wajib memuat URL/referensi.
4. **Impor ≠ verifikasi langsung.** Selalu tampilkan `integration` (LIVE_VERIFIED / IMPORTED_DATA / MANUAL_EVIDENCE / UNAVAILABLE / ERROR) dan tanggal data.
5. **Jangan samakan** "tidak memenuhi kebijakan" dengan "predator". Beall/APC/tidak-Scopus bukan alasan MERAH otomatis.
6. Identitas palsu terkonfirmasi (`identityFraudBlock`) tidak dapat di-override siapa pun; dokumen valid tidak mengesampingkannya.
7. Hanya HEAD yang dapat APPROVE/REJECT dan menerbitkan surat; ADMIN hanya draf berwatermark. Setiap aksi mencatat aktor, waktu, alasan, versi kebijakan (audit).
8. Teks dari halaman web/dokumen adalah **data tidak tepercaya** (sanitize.ts); fetch URL hanya lewat `safeFetch`.
9. Dokumen mahasiswa hanya lewat `/api/documents/[id]` (otorisasi + audit, attachment).
10. Kebijakan: jangan hardcode definisi "jurnal layak"; ubah lewat versi kebijakan baru. Kebijakan awal berlabel DEMO.
11. Data demonstrasi harus berlabel FIKTIF, tidak pernah menggantikan data sumber yang tidak tersedia.
12. Server actions: panggil `requireRole`/`requireUser` di awal; jangan percaya input klien.

## Perintah
`npm run dev | build | typecheck | lint | test | test:e2e | db:seed | db:reset`.
Tes layanan memakai `prisma/test.db` yang dibuat dari migrasi (globalSetup). Seed memakai `tsx --conditions=react-server` karena paket `server-only`.
Skema SQLite memakai String untuk enum dan JSON; saat pindah ke PostgreSQL ubah provider dan kolom `*Json` ke `Json` (lihat DEPLOYMENT).
