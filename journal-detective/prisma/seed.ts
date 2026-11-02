/* Seed DEMONSTRASI. Seluruh data fiktif. Jalankan: npm run db:seed */
process.env.DISABLE_EXTERNAL_LOOKUPS = "1";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { importDataset } from "../src/lib/services/reference";
import { getActivePolicy } from "../src/lib/services/policyService";
import { createApplication, updateStage, addEvent, setChecklist } from "../src/lib/services/applications";
import { uploadDocument } from "../src/lib/services/documents";
import { reviewEvidence } from "../src/lib/services/investigation";
import { performReviewAction } from "../src/lib/services/approval";
import { audit } from "../src/lib/services/audit";
import { getMode, writeMarker } from "../src/lib/mode";
import { createCase, recordReference, runCase } from "../src/lib/services/validation";

const fx = (f: string) => readFileSync(path.join(__dirname, "..", "fixtures", f));
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function main() {
  if (getMode() !== "DEMO") { console.error("Seed demonstrasi hanya untuk APP_MODE=DEMO. DITOLAK pada PILOT."); process.exit(2); }
  if ((await prisma.user.count()) > 0) {
    console.log("Basis data sudah berisi pengguna; seed dilewati. Gunakan `npm run db:reset` untuk mengulang.");
    return;
  }
  const pw = process.env.DEMO_PASSWORD || "demo-journal-detective";
  const hash = await bcrypt.hash(pw, 11);
  const mk = (email: string, name: string, role: string, extra: Record<string, string> = {}) => prisma.user.create({ data: { email, name, role, passwordHash: hash, ...extra } });
  const head = await mk("kepala@jd.example", "Dr. Kepala Unit (FIKTIF)", "HEAD");
  const reviewer = await mk("peninjau@jd.example", "Peninjau Akademik (FIKTIF)", "REVIEWER");
  const admin = await mk("admin@jd.example", "Administrator Sistem (FIKTIF)", "ADMIN");
  const student = await mk("mahasiswa@jd.example", "Mahasiswa Contoh (FIKTIF)", "STUDENT", { studentNumber: "K011230000", studyProgram: "Program Studi Fiktif" });
  await getActivePolicy(); // membuat kebijakan DEMONSTRASI v1

  const A = { id: admin.id, name: admin.name, role: admin.role };
  const R = { id: reviewer.id, name: reviewer.name, role: reviewer.role as "REVIEWER" };
  const H = { id: head.id, name: head.name, role: head.role as "HEAD" };
  const S = { id: student.id, name: student.name, role: student.role };

  const d = (n: number) => daysAgo(n);
  for (const [kind, file, label, date, prov] of [
    ["SCOPUS_SOURCE_LIST", "scopus_fiktif.csv", "DEMO Scopus (FIKTIF)", d(30), "Berkas fiktif dibuat untuk demonstrasi; bukan data Scopus asli."],
    ["SCIMAGO", "scimago_fiktif.csv", "DEMO SCImago (FIKTIF)", d(30), "Berkas fiktif dibuat untuk demonstrasi; bukan data SCImago asli."],
    ["BEALL", "beall_fiktif.csv", "DEMO Beall (FIKTIF)", d(2500), "Berkas fiktif dibuat untuk demonstrasi; bukan daftar Beall asli."],
    ["HIJACKED", "hijacked_fiktif.csv", "DEMO Hijacked (FIKTIF)", d(20), "Berkas fiktif dibuat untuk demonstrasi; bukan data Retraction Watch asli."],
  ] as const) {
    await importDataset({ kind, buffer: fx(file), filename: file, versionLabel: label, provenance: prov, sourceDate: date, isComplete: true, isDemo: true, actor: A });
  }

  const base = { studentName: S.name, studentNumber: "K011230000", studyProgram: "Program Studi Fiktif", supervisor: "Prof. Pembimbing (FIKTIF)", studentEmail: student.email, researchField: "Kesehatan Masyarakat" };

  // 1. Pra-pengiriman: jurnal HIJAU (Case A)
  const a1 = await createApplication({ ...base, manuscriptTitle: "Faktor Risiko Stunting pada Anak Usia Dini di Wilayah Fiktif", stage: "PRE_SUBMISSION", journalName: "Jurnal Riset Kesehatan Nusantara (FIKTIF)", journalIssn: "9900-0016", journalPublisher: "Penerbit Fiktif Nusantara", claimedIndexing: "Scopus", claimedQuartile: "Q2", journalUrl: "https://jurnal-riset-kesehatan.example" } as any, S, student.id);
  await performReviewAction({ applicationId: a1.id, actor: R, action: "START_REVIEW", rationale: "Mulai tinjauan permohonan pra-pengiriman." });
  await performReviewAction({ applicationId: a1.id, actor: R, action: "RECOMMEND_APPROVE", rationale: "Jurnal terverifikasi dari data impor; situs sesuai domain resmi." });

  // 2. Diterima, surat penerimaan belum diverifikasi (Case B)
  const a2 = await createApplication({ ...base, manuscriptTitle: "Faktor Risiko Stunting pada Anak Usia Dini di Wilayah Fiktif", stage: "ACCEPTED", submissionDate: "2026-07-01", trackingId: "JRKN-2026-0042", journalName: "Jurnal Riset Kesehatan Nusantara (FIKTIF)", journalIssn: "9900-0016", journalPublisher: "Penerbit Fiktif Nusantara", claimedIndexing: "Scopus", journalUrl: "https://jurnal-riset-kesehatan.example" } as any, S, student.id);
  await addEvent(a2.id, { type: "ACCEPTED", occurredAt: "2026-09-12", note: "Diterima tanpa putaran revisi (sah)" }, S);
  await uploadDocument({ applicationId: a2.id, docType: "ACCEPTANCE_LETTER", filename: "surat_penerimaan_fiktif.txt", data: fx("surat_penerimaan_fiktif.txt"), actor: S });
  await setChecklist(a2.id, "SUBMISSION_ACK", "MET", "Tanda terima terverifikasi (demo)", R);

  // 3. Situs klon terkonfirmasi + surat penerimaan (Case C/H)
  const a3 = await createApplication({ ...base, studentName: S.name, manuscriptTitle: "Faktor Risiko Stunting pada Anak Usia Dini di Wilayah Fiktif", stage: "PAYMENT_REQUESTED", submissionDate: "2026-07-01", trackingId: "JRKN-2026-0042", journalName: "Jurnal Riset Kesehatan Nusantara (FIKTIF)", journalIssn: "9900-0016", journalPublisher: "Penerbit Fiktif Nusantara", claimedIndexing: "Scopus", journalUrl: "https://jurnal-riset-kesehatan-online.example" } as any, S, student.id);
  const inv3 = await prisma.assessment.findUniqueOrThrow({ where: { id: a3.assessmentId! } });
  const ev3 = await prisma.evidence.findFirstOrThrow({ where: { assessmentId: inv3.id, key: "hijack.website" } });
  await reviewEvidence({ journalId: inv3.journalId, fingerprint: ev3.fingerprint, decision: "CONFIRMED", note: "Domain terdaftar sebagai klon pada daftar rujukan; dikonfirmasi peninjau (demo).", actor: R });
  await uploadDocument({ applicationId: a3.id, docType: "ACCEPTANCE_LETTER", filename: "surat_penerimaan_fiktif.txt", data: fx("surat_penerimaan_fiktif.txt"), actor: S });
  await setChecklist(a3.id, "ACCEPTANCE_LETTER", "MET", "Dokumen tampak koheren (demo)", R);
  await performReviewAction({ applicationId: a3.id, actor: R, action: "REASSESS", rationale: "Penilaian ulang setelah konfirmasi klon oleh peninjau." });

  // 4. Cakupan Scopus dihentikan → MERAH kebijakan (Case D)
  await createApplication({ ...base, manuscriptTitle: "Analisis Logistik Pelabuhan Fiktif Menggunakan Simulasi", researchField: "Teknologi Maritim", stage: "PRE_SUBMISSION", journalName: "Jurnal Teknologi Maritim Lama (FIKTIF)", journalIssn: "9900-0024", journalPublisher: "Penerbit Maritim Fiktif", claimedIndexing: "Scopus", journalUrl: "https://teknologi-maritim.example" } as any, S, student.id);

  // 5. Kecocokan Beall historis → KUNING (Case E)
  await createApplication({ ...base, manuscriptTitle: "Studi Klinis Fiktif tentang Intervensi Gizi Mikro", stage: "PRE_SUBMISSION", journalName: "Journal of Fictional Clinical Studies", journalIssn: "9900-0032", journalPublisher: "Fictional Clinical Press", claimedIndexing: "Scopus", claimedQuartile: "Q1", journalUrl: "https://fictional-clinical.example" } as any, S, student.id);

  // 6. Jurnal tanpa data rujukan apa pun → Scopus UNVERIFIED (Case F)
  await createApplication({ ...base, manuscriptTitle: "Evaluasi Program Posyandu di Wilayah Fiktif", stage: "PRE_SUBMISSION", journalName: "Jurnal Tanpa Data Rujukan (FIKTIF)", journalIssn: "9900-0040", journalPublisher: "Penerbit Tidak Dikenal (FIKTIF)", claimedIndexing: "Scopus", journalUrl: "https://tanpa-data.example" } as any, S, student.id);

  // 7. Diterima TANPA putaran revisi, bukti koheren → HIJAU/HIJAU (Case G)
  const a7 = await createApplication({ ...base, manuscriptTitle: "Faktor Risiko Stunting pada Anak Usia Dini di Wilayah Fiktif", stage: "ACCEPTED", submissionDate: "2026-06-01", trackingId: "JRKN-2026-0042", journalName: "Jurnal Riset Kesehatan Nusantara (FIKTIF)", journalIssn: "9900-0016", journalPublisher: "Penerbit Fiktif Nusantara", claimedIndexing: "Scopus", journalUrl: "https://jurnal-riset-kesehatan.example" } as any, S, student.id);
  await addEvent(a7.id, { type: "SUBMITTED", occurredAt: "2026-06-01", note: "Dikirim" }, S);
  await addEvent(a7.id, { type: "UNDER_REVIEW", occurredAt: "2026-06-10" }, S);
  await addEvent(a7.id, { type: "ACCEPTED", occurredAt: "2026-09-12", note: "Diterima tanpa revisi — sah" }, S);
  await uploadDocument({ applicationId: a7.id, docType: "ACCEPTANCE_LETTER", filename: "surat_penerimaan_fiktif.txt", data: fx("surat_penerimaan_fiktif.txt"), actor: S });
  await setChecklist(a7.id, "SUBMISSION_ACK", "MET", "Tanda terima diverifikasi (demo)", R);
  await setChecklist(a7.id, "ACCEPTANCE_LETTER", "MET", "Koheren dengan riwayat editorial (demo)", R);

  // 8. Domain mirip domain resmi (satu huruf berbeda) → KUNING, perlu konfirmasi peninjau
  await createApplication({ ...base, manuscriptTitle: "Studi Kualitas Air Minum di Wilayah Fiktif", stage: "PRE_SUBMISSION", journalName: "Jurnal Riset Kesehatan Nusantara (FIKTIF)", journalIssn: "9900-0016", journalPublisher: "Penerbit Fiktif Nusantara", claimedIndexing: "Scopus", journalUrl: "https://jurnal-riset-kesehatam.example" } as any, S, student.id);

  // 9. Faktur APC mengarah ke domain di luar domain resmi → tanda HIGH, administratif KUNING
  const a9 = await createApplication({ ...base, manuscriptTitle: "Faktor Risiko Stunting pada Anak Usia Dini di Wilayah Fiktif", stage: "PAYMENT_REQUESTED", submissionDate: "2026-06-01", trackingId: "JRKN-2026-0042", journalName: "Jurnal Riset Kesehatan Nusantara (FIKTIF)", journalIssn: "9900-0016", journalPublisher: "Penerbit Fiktif Nusantara", claimedIndexing: "Scopus", journalUrl: "https://jurnal-riset-kesehatan.example" } as any, S, student.id);
  await uploadDocument({ applicationId: a9.id, docType: "APC_INVOICE", filename: "faktur_fiktif.txt", data: Buffer.from("[FIKTIF] Invoice APC\nManuscript ID: JRKN-2026-0042\nBayar di https://bayar-apc-cepat.example/pay\nUSD 300"), actor: S });

  // Fixture validasi FIKTIF (bukan validasi nyata; tidak dihitung pada cakupan nyata)
  const fx4: Array<[string, string, string, string, string, string, [string, string, string, string]]> = [
    ["GENUINE_VERIFIED", "Jurnal Riset Kesehatan Nusantara (FIKTIF)", "9900-0016", "https://jurnal-riset-kesehatan.example", "https://jurnal-riset-kesehatan.example", "Fixture: jurnal sah, situs otentik.", ["GREEN", "GREEN", "GREEN", "GREEN"]],
    ["CONFIRMED_CLONE", "Jurnal Riset Kesehatan Nusantara (FIKTIF)", "9900-0016", "https://jurnal-riset-kesehatan-online.example", "https://jurnal-riset-kesehatan.example", "Fixture: tujuan klon terkonfirmasi; jurnal asli sah.", ["GREEN", "RED", "GREEN", "RED"]],
    ["DISCONTINUED_INDEXING", "Jurnal Teknologi Maritim Lama (FIKTIF)", "9900-0024", "https://teknologi-maritim.example", "https://teknologi-maritim.example", "Fixture: Scopus dihentikan pada kebijakan yang mewajibkan aktif.", ["RED", "GREEN", "GREEN", "RED"]],
    ["HISTORICAL_BEALL", "Journal of Fictional Clinical Studies", "9900-0032", "https://fictional-clinical.example", "https://fictional-clinical.example", "Fixture: referensi SENGAJA berbeda (GREEN) untuk mendemonstrasikan alur klasifikasi perbedaan.", ["GREEN", "GREEN", "GREEN", "GREEN"]],
  ];
  for (const [category, title, issn, url, authentic, note, st] of fx4) {
    const c = await createCase({ category, title, issn, submittedUrl: url, authenticUrl: authentic, stage: "PRE_SUBMISSION", pseudonym: "S-FIKTIF", notes: note, isFictionalFixture: true, sources: [{ label: "fixtures/*.csv (data FIKTIF)", ref: "fixtures/README.md" }] } as any, R);
    await recordReference(c.id, { journalStatus: st[0] as any, destinationStatus: st[1] as any, adminStatus: st[2] as any, finalStatus: st[3] as any, rationale: "FIXTURE FIKTIF: referensi ditulis otomatis oleh seed untuk demonstrasi alur. BUKAN penilaian manusia dan BUKAN validasi nyata.", uncertainty: null, assessedAt: new Date().toISOString().slice(0, 10), sources: [{ label: "Seed demonstrasi", ref: "prisma/seed.ts" }] }, R);
    await runCase(c.id, R);
  }

  // Sebaran waktu agar grafik bulanan bermakna
  const apps = await prisma.application.findMany({ orderBy: { createdAt: "asc" } });
  const offs = [75, 60, 50, 40, 30, 20, 12, 5, 1];
  for (let i = 0; i < apps.length; i++) await prisma.application.update({ where: { id: apps[i].id }, data: { createdAt: daysAgo(offs[i] ?? 1) } });

  await prisma.journal.updateMany({ data: { isDemo: true } }); // seluruh jurnal seed FIKTIF
  await writeMarker("DEMO", "Data demonstrasi FIKTIF");
  await audit(A, "SEED_DEMO", "System", null, { note: "Data demonstrasi FIKTIF dimuat" });
  console.log(`Seed selesai. Pengguna demo (kata sandi dari DEMO_PASSWORD):\n  ${head.email} (Kepala Unit)\n  ${reviewer.email} (Peninjau)\n  ${admin.email} (Administrator)\n  ${student.email} (Mahasiswa)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
