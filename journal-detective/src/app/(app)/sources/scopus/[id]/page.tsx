import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getSourceDetail } from "@/lib/services/scopusReference";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
const fmt = (k: string | null) => (k ? `${k.slice(0, 4)}-${k.slice(4)}` : "—");

export default async function ScopusRecord({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("REVIEWER", "HEAD", "ADMIN");
  const [{ id }, { lang }] = await Promise.all([params, getT()]);
  const r = await getSourceDetail(id);
  if (!r) notFound();
  const L = lang === "id";
  const i = r.import;
  return (
    <>
      <PageHeader title={r.title} subtitle={`${L ? "Berdasarkan" : "Based on"} ${L ? "impor Scopus" : "Scopus import"} ${i.versionLabel} (${L ? "pengamatan" : "observed"} ${fmtDate(i.observationDate)}) — ${L ? "data historis, bukan verifikasi langsung" : "historical data, not live verification"}`}
        actions={<Link className="btn-primary" href={`/investigations/new?sid=${r.id}`}>{L ? "Periksa jurnal ini" : "Investigate this journal"}</Link>} />
      {r.conflicts.length > 0 && <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-warn-soft p-3 text-sm text-warn-ink"><b>{L ? "Konflik data untuk ditinjau" : "Data conflicts for review"}:</b><ul className="list-disc pl-5">{r.conflicts.map((c: any, k: number) => <li key={k}><b>{c.type}</b>: {c.detail}</li>)}</ul></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title={L ? "Identitas & status" : "Identity & status"} /><CardBody className="space-y-2 text-sm">
          <div><span className="label">Source ID</span><span className="font-mono">{r.sourceId ?? "—"}</span></div>
          <div><span className="label">Print-ISSN / E-ISSN</span><span className="font-mono">{r.issnRaw ?? "—"} / {r.eissnRaw ?? "—"}</span> <span className="text-xs text-slate-500">({L ? "kunci pencarian" : "search key"}: {fmt(r.issn)} / {fmt(r.eissn)})</span></div>
          <div><span className="label">{L ? "Status (menurut berkas)" : "Status (per file)"}</span><Pill tone={r.status === "ACTIVE" ? "green" : r.status === "ACCEPTED" ? "amber" : "slate"}>{r.status}</Pill> <span className="text-xs text-slate-500">{r.activeRaw}</span>
            {r.status === "ACCEPTED" && <p className="mt-1 text-xs">{L ? "Diterima untuk proses penambahan — BUKAN otomatis aktif terindeks." : "Accepted for the addition process — NOT automatically actively indexed."}</p>}
            {r.status === "INACTIVE" && <p className="mt-1 text-xs">{r.discontinuedQuality ? (L ? "Ditandai dihentikan karena masalah kualitas oleh Scopus." : "Flagged by Scopus as discontinued for quality reasons.") : (L ? "Inactive TIDAK ditandai karena masalah kualitas." : "Inactive is NOT flagged as quality-related.")}</p>}</div>
          <div><span className="label">Coverage</span>{r.coverage ?? "—"}</div>
          <div><span className="label">{L ? "Kolom 'Titles Discontinued by Scopus'" : "'Titles Discontinued by Scopus' column"}</span>{r.discontinuedRaw ?? "—"}</div>
          <div><span className="label">Source Type</span>{r.sourceType ?? "—"}</div>
          <div><span className="label">{L ? "Penerbit" : "Publisher"}</span>{r.publisher ?? "—"}</div>
          <div><span className="label">{L ? "Grup penerbit" : "Publisher group"}</span>{r.publisherGroup ?? "—"}</div>
          <div><span className="label">{L ? "Negara penerbit" : "Publisher country"}</span>{r.publisherCountry ?? "—"}</div>
          <div><span className="label">ASJC</span>{r.asjc ?? "—"}</div>
          <div><span className="label">{L ? "Sheet asal" : "Origin sheet"}</span>{r.origin}</div>
        </CardBody></Card>
        <div className="space-y-6">
          <Card><CardHeader title={L ? "Data penghentian (sheet Discontinued)" : "Discontinuation data (Discontinued sheet)"} /><CardBody className="space-y-1.5 text-sm">
            {r.discontinued ? (<><div><span className="label">Indexation Change</span>{r.discontinued.indexationChange ?? "—"}</div><div><span className="label">{L ? "Cakupan akhir" : "Final coverage"}</span>{L ? "tahun" : "year"} {r.discontinued.finalYearRaw ?? "—"} · vol. {r.discontinued.finalVolume ?? "—"} · issue {r.discontinued.finalIssue ?? "—"} · {L ? "halaman" : "pages"} {r.discontinued.finalPages ?? "—"}</div></>) : <p className="text-slate-600">{L ? "Tidak ada pada sheet Discontinued." : "Not in the Discontinued sheet."}</p>}
          </CardBody></Card>
          {r.accepted && <Card><CardHeader title={L ? "Data Accepted Titles" : "Accepted Titles data"} /><CardBody className="text-sm"><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(r.accepted.extra, null, 1)}</pre></CardBody></Card>}
          <Card><CardHeader title={L ? "Kolom tambahan (tidak dikenal, disimpan apa adanya)" : "Extra columns (unmapped, stored as-is)"} /><CardBody className="text-xs">{Object.keys(r.extra).length ? <ul className="list-disc pl-4">{Object.entries(r.extra).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}</ul> : "—"}</CardBody></Card>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500">{L ? "Status terindeks pada impor TIDAK membuktikan situs pengiriman autentik maupun klirens akhir; tujuan dan administratif dinilai terpisah." : "An indexed status in the import does NOT prove the submission website is authentic nor grant final clearance; destination and administrative are assessed separately."}</p>
    </>
  );
}
