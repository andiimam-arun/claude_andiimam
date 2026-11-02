import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { startInvestigationAction } from "@/app/actions/investigations";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";

export default async function NewInvestigation({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("REVIEWER", "HEAD", "ADMIN");
  const [{ lang }, sp] = await Promise.all([getT(), searchParams]);
  const id = lang === "id";
  return (
    <>
      <PageHeader title={id ? "Investigasi Jurnal Baru" : "New Journal Investigation"}
        subtitle={id ? "Registri institusi dicari lebih dahulu (ISSN, Source ID, judul ternormalisasi). Bukti yang sensitif waktu selalu divalidasi ulang." : "The institutional registry is searched first (ISSN, Source ID, normalized title). Time-sensitive evidence is always revalidated."} />
      {sp.error && <Notice kind="error">{sp.error}</Notice>}
      <form action={startInvestigationAction}>
        <Card>
          <CardHeader title={id ? "Identitas jurnal" : "Journal identity"} subtitle={id ? "Gunakan identifier (ISSN/Source ID); judul saja adalah pencocokan lemah." : "Use identifiers (ISSN/Source ID); title alone is a weak match."} />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label={id ? "Judul jurnal *" : "Journal title *"} className="md:col-span-2"><Input name="title" required minLength={3} /></Field>
            <Field label="ISSN"><Input name="issn" placeholder="0000-0000" /></Field>
            <Field label="E-ISSN"><Input name="eissn" placeholder="0000-0000" /></Field>
            <Field label="Scopus Source ID"><Input name="scopusSourceId" /></Field>
            <Field label={id ? "Penerbit" : "Publisher"}><Input name="publisher" /></Field>
            <Field label={id ? "Negara" : "Country"}><Input name="country" /></Field>
            <Field label={id ? "Judul alternatif / historis (pisahkan koma)" : "Alternative / historical titles (comma separated)"}><Input name="altTitles" /></Field>
            <Field label={id ? "Situs yang diajukan mahasiswa (URL beranda / sistem pengiriman)" : "Website submitted by student (homepage / submission system URL)"} className="md:col-span-2" hint={id ? "Tidak pernah dianggap benar sampai dibandingkan dengan domain resmi dari sumber independen." : "Never assumed authentic until compared with an official domain from an independent source."}>
              <Input name="submittedWebsite" type="url" placeholder="https://" />
            </Field>
            <Field label={id ? "Bidang subjek (pisahkan koma)" : "Subject categories (comma separated)"}><Input name="subjects" /></Field>
            <Field label={id ? "Klaim indeksasi (pisahkan koma)" : "Claimed indexing (comma separated)"} hint="Scopus, DOAJ, SINTA 2, …"><Input name="claimedIndexing" /></Field>
            <Field label={id ? "Klaim kuartil" : "Claimed quartile"}><Input name="claimedQuartile" placeholder="Q1" maxLength={4} /></Field>
          </CardBody>
        </Card>
        <div className="mt-5 flex gap-3"><button className="btn-primary" type="submit">{id ? "Jalankan Investigasi" : "Run Investigation"}</button></div>
        <p className="mt-3 max-w-2xl text-xs text-slate-500">{id ? "Sistem menjalankan 6 pemeriksaan. Sumber yang tidak tersedia ditampilkan apa adanya (UNAVAILABLE) dan tidak pernah diganti data demonstrasi." : "The system runs 6 checks. Unavailable sources are shown as-is (UNAVAILABLE) and never replaced with demonstration data."}</p>
      </form>
    </>
  );
}
