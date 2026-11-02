import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { createCaseAction } from "@/app/actions/validation";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { VALIDATION_CATEGORIES } from "@/lib/engine/validation";
import { STAGES } from "@/lib/engine/types";
import { isPilot } from "@/lib/mode";

export default async function NewCase({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("REVIEWER", "HEAD");
  const [{ lang, t }, sp] = await Promise.all([getT(), searchParams]);
  const L = lang === "id";
  return (
    <>
      <PageHeader title={L ? "Kasus Validasi Baru" : "New Validation Case"} subtitle={L ? "Masukkan HANYA kasus nyata yang bukti independennya dapat dirujuk. Gunakan pseudonim untuk mahasiswa; jangan memasukkan identitas atau dokumen rahasia." : "Enter ONLY real cases whose independent evidence can be referenced. Use pseudonyms for students; do not enter confidential identities or documents."} />
      {sp.error && <Notice kind="error">{sp.error}</Notice>}
      <form action={createCaseAction}><Card><CardHeader title={L ? "Detail kasus" : "Case details"} /><CardBody className="grid gap-4 md:grid-cols-2">
        <Field label={L ? "Skenario cakupan *" : "Coverage scenario *"} className="md:col-span-2"><Select name="category">{VALIDATION_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{L ? c.id : c.en}</option>)}</Select></Field>
        <Field label={L ? "Judul jurnal *" : "Journal title *"} className="md:col-span-2"><Input name="title" required /></Field>
        <Field label="ISSN"><Input name="issn" /></Field><Field label="E-ISSN"><Input name="eissn" /></Field>
        <Field label={L ? "URL yang diajukan (tujuan persis)" : "Submitted URL (exact destination)"}><Input name="submittedUrl" /></Field>
        <Field label={L ? "URL otentik terverifikasi independen" : "Independently verified authentic URL"}><Input name="authenticUrl" /></Field>
        <Field label={L ? "Tahap permohonan" : "Application stage"}><Select name="stage" defaultValue="PRE_SUBMISSION">{STAGES.map((s) => <option key={s} value={s}>{t(`stage.${s}`)}</option>)}</Select></Field>
        <Field label={L ? "Pseudonim mahasiswa" : "Student pseudonym"}><Input name="pseudonym" placeholder="S-017" /></Field>
        <Field label={L ? "ID permohonan di sistem (opsional; untuk menilai dimensi administratif)" : "Application ID in the system (optional; to assess the administrative dimension)"} className="md:col-span-2"><Input name="applicationId" /></Field>
        <Field label={L ? "Sumber (satu per baris): label | URL atau referensi dokumen | tgl data sumber | tgl diambil" : "Sources (one per line): label | URL or document reference | source data date | retrieval date"} className="md:col-span-2"><Textarea name="sources" rows={4} placeholder="Halaman penerbit | https://… | 2026-10-01 | 2026-11-02" /></Field>
        <Field label={L ? "Catatan" : "Notes"} className="md:col-span-2"><Textarea name="notes" /></Field>
        {!isPilot() && <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="isFictionalFixture" /> {L ? "Fixture FIKTIF (hanya DEMO; tidak dihitung sebagai validasi nyata)" : "FICTIONAL fixture (DEMO only; not counted as real validation)"}</label>}
      </CardBody></Card><div className="mt-4"><button className="btn-primary" type="submit">{L ? "Buat kasus" : "Create case"}</button></div></form>
    </>
  );
}
