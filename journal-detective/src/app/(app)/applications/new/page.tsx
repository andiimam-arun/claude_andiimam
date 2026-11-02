import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { STAGES, DOC_TYPES } from "@/lib/engine/types";
import { createApplicationAction } from "@/app/actions/applications";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";

export default async function NewApplication({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const [{ lang, t }, sp] = await Promise.all([getT(), searchParams]);
  const me = await prisma.user.findUnique({ where: { id: user.id } });
  const L = lang === "id";
  const stu = user.role === "STUDENT";
  return (
    <>
      <PageHeader title={L ? "Permohonan Penilaian Jurnal / Klirens Publikasi" : "Journal Assessment / Publication Clearance Request"} subtitle={L ? "Untuk pra-pengiriman, cukup identitas jurnal & tujuan pengiriman. Bukti hanya diminta untuk peristiwa yang sudah terjadi." : "For pre-submission, only journal identity and the intended destination are needed. Evidence is requested only for events that have already happened."} />
      {sp.error && <Notice kind="error">{sp.error}</Notice>}
      <form action={createApplicationAction} encType="multipart/form-data" className="space-y-5">
        <Card><CardHeader title={L ? "Data mahasiswa" : "Student information"} /><CardBody className="grid gap-4 md:grid-cols-2">
          <Field label={L ? "Nama mahasiswa *" : "Student name *"}><Input name="studentName" required defaultValue={stu ? me?.name : ""} /></Field>
          <Field label={L ? "NIM *" : "Student ID *"}><Input name="studentNumber" required defaultValue={stu ? me?.studentNumber ?? "" : ""} /></Field>
          <Field label={L ? "Program studi *" : "Study program *"}><Input name="studyProgram" required defaultValue={stu ? me?.studyProgram ?? "" : ""} /></Field>
          <Field label={L ? "Dosen pembimbing *" : "Academic supervisor *"}><Input name="supervisor" required /></Field>
          <Field label="Email *"><Input name="studentEmail" type="email" required defaultValue={stu ? me?.email : ""} /></Field>
        </CardBody></Card>
        <Card><CardHeader title={L ? "Data naskah" : "Manuscript information"} /><CardBody className="grid gap-4 md:grid-cols-2">
          <Field label={L ? "Judul naskah *" : "Manuscript title *"} className="md:col-span-2"><Input name="manuscriptTitle" required minLength={8} /></Field>
          <Field label={L ? "Bidang penelitian *" : "Research field *"}><Input name="researchField" required /></Field>
          <Field label={L ? "Tahap saat ini *" : "Current stage *"}><Select name="stage" defaultValue="PRE_SUBMISSION">{STAGES.map((s) => <option key={s} value={s}>{t(`stage.${s}`)}</option>)}</Select></Field>
          <Field label={L ? "Tanggal pengiriman (bila sudah)" : "Submission date (if applicable)"}><Input name="submissionDate" type="date" /></Field>
          <Field label={L ? "ID pelacakan naskah (bila ada)" : "Manuscript tracking ID (if any)"}><Input name="trackingId" /></Field>
          <Field label={L ? "URL jurnal / sistem pengiriman" : "Journal / submission-system URL"}><Input name="journalUrl" type="url" placeholder="https://" /></Field>
          <Field label="DOI / URL artikel (bila ada)"><Input name="articleDoi" /></Field>
        </CardBody></Card>
        <Card><CardHeader title={L ? "Data jurnal" : "Journal information"} /><CardBody className="grid gap-4 md:grid-cols-2">
          <Field label={L ? "Nama jurnal *" : "Journal name *"} className="md:col-span-2"><Input name="journalName" required /></Field>
          <Field label="ISSN / E-ISSN" hint={L ? "Pisahkan dengan spasi atau koma" : "Separate with space or comma"}><Input name="journalIssn" /></Field>
          <Field label={L ? "Penerbit" : "Publisher"}><Input name="journalPublisher" /></Field>
          <Field label={L ? "Klaim indeksasi" : "Claimed indexing"} hint="Scopus, DOAJ, SINTA 2…"><Input name="claimedIndexing" /></Field>
          <Field label={L ? "Klaim kuartil" : "Claimed quartile"}><Input name="claimedQuartile" placeholder="Q2" maxLength={4} /></Field>
        </CardBody></Card>
        <Card><CardHeader title={L ? "Unggah bukti (opsional)" : "Evidence upload (optional)"} subtitle={L ? "PDF, PNG, JPG, TXT, EML, DOCX — maks. 10 MB. Dokumen dirahasiakan dan hanya dapat dibuka pihak berwenang." : "PDF, PNG, JPG, TXT, EML, DOCX — max 10 MB. Documents are confidential and only visible to authorized parties."} />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label={L ? "Jenis dokumen" : "Document type"}><Select name="docType" defaultValue="SUBMISSION_ACK">{DOC_TYPES.map((d) => <option key={d} value={d}>{t(`doc.${d}`)}</option>)}</Select></Field>
            <Field label={L ? "Berkas" : "File"}><input className="input" type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.eml,.docx" /></Field>
          </CardBody></Card>
        <button className="btn-primary" type="submit">{L ? "Kirim permohonan" : "Submit application"}</button>
      </form>
    </>
  );
}
