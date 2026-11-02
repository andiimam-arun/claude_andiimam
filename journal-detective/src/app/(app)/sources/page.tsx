import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { listDatasets, DATASET_KINDS } from "@/lib/services/reference";
import { importDatasetAction, toggleDatasetAction } from "@/app/actions/admin";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SOURCES: Array<{ name: string; state: string; tone: "green" | "amber" | "slate"; id: string; en: string }> = [
  { name: "Scopus Source List (impor CSV/XLSX)", state: "IMPORTED_DATA", tone: "amber", id: "Impor administratif berlisensi. Selalu berlabel data historis; tidak pernah disebut verifikasi langsung.", en: "Licensed administrative import. Always labelled historical data; never called live verification." },
  { name: "Scopus Serial Title API", state: "UNAVAILABLE", tone: "slate", id: "Titik ekstensi Fase 2: aktif bila SCOPUS_API_KEY berlisensi diisi; belum diuji terhadap API langsung.", en: "Phase 2 extension point: active when a licensed SCOPUS_API_KEY is set; not yet tested against the live API." },
  { name: "SCImago (impor / bukti manual)", state: "IMPORTED_DATA", tone: "amber", id: "Tanpa scraping. Impor ekspor resmi atau bukti manual; bukti historis pelengkap.", en: "No scraping. Import an official export or enter manual evidence; supplementary historical evidence." },
  { name: "DOAJ API", state: "LIVE_VERIFIED", tone: "green", id: "API publik terbuka (kueri ISSN). Bila jaringan tidak tersedia → UNAVAILABLE.", en: "Open public API (ISSN query). If the network is unavailable → UNAVAILABLE." },
  { name: "Crossref REST API", state: "LIVE_VERIFIED", tone: "green", id: "API publik terbuka. DOI terdaftar bukan bukti kualitas.", en: "Open public API. A registered DOI is not proof of quality." },
  { name: "Retraction Watch Hijacked Journal Checker", state: "MANUAL_EVIDENCE", tone: "amber", id: "Tidak ada API terautorisasi: gunakan pemeriksaan manual terdokumentasi atau impor daftar yang diizinkan.", en: "No authorized API: use documented manual verification or an import where permitted." },
  { name: "Beall's List (historis)", state: "IMPORTED_DATA", tone: "amber", id: "Tidak dibundel. Impor sendiri bila diinginkan; hanya pemicu tinjauan.", en: "Not bundled. Import your own copy if desired; only a review trigger." },
  { name: "Think. Check. Submit. / COPE", state: "MANUAL_EVIDENCE", tone: "slate", id: "Kerangka acuan untuk tinjauan transparansi manual.", en: "Reference frameworks for manual transparency review." },
];

export default async function Sources({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireRole("REVIEWER", "HEAD", "ADMIN");
  const [{ lang, t }, sp] = await Promise.all([getT(), searchParams]);
  const L = lang === "id";
  const ds = await listDatasets();
  const canImport = user.role === "ADMIN" || user.role === "HEAD";
  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}{sp.error && <Notice kind="error">{sp.error}</Notice>}
      <PageHeader title={t("nav.sources")} subtitle={L ? "Status integrasi eksternal ditampilkan apa adanya. Sumber yang tidak tersedia tidak pernah diganti data demonstrasi." : "External-integration states are shown as they are. Unavailable sources are never replaced with demonstration data."} />
      <Card className="mb-6"><CardHeader title={L ? "Status integrasi" : "Integration status"} /><ul className="divide-y divide-slate-100">{SOURCES.map((s) => (
        <li key={s.name} className="flex flex-wrap items-start gap-3 px-5 py-3"><div className="min-w-[220px] flex-1"><div className="text-sm font-semibold">{s.name}</div><div className="text-xs text-slate-600">{L ? s.id : s.en}</div></div><Pill tone={s.tone}>{t(`integ.${s.state}`)}</Pill></li>))}</ul></Card>
      {canImport && (
        <Card className="mb-6"><CardHeader title={L ? "Impor dataset rujukan" : "Import reference dataset"} subtitle={L ? "CSV atau XLSX yang diperoleh secara sah. Tanggal, versi, dan asal-usul dicatat." : "Lawfully obtained CSV or XLSX. Date, version and provenance are recorded."} />
          <CardBody><form action={importDatasetAction} encType="multipart/form-data" className="grid gap-3 md:grid-cols-2">
            <label><span className="label">{L ? "Jenis" : "Kind"}</span><select className="input" name="kind">{DATASET_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label><span className="label">{L ? "Berkas (CSV/XLSX)" : "File (CSV/XLSX)"}</span><input className="input" type="file" name="file" accept=".csv,.xlsx,.tsv,.txt" required /></label>
            <label><span className="label">{L ? "Label versi *" : "Version label *"}</span><input className="input" name="versionLabel" required placeholder="Scopus Source List Okt 2026" /></label>
            <label><span className="label">{L ? "Tanggal data sumber" : "Source data date"}</span><input className="input" type="date" name="sourceDate" /></label>
            <label className="md:col-span-2"><span className="label">{L ? "Asal-usul & dasar lisensi *" : "Provenance & licence basis *"}</span><input className="input" name="provenance" required placeholder="Diunduh dari … oleh …, sesuai lisensi institusi …" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isComplete" defaultChecked /> {L ? "Daftar lengkap dari sumber resmi" : "Complete list from the official source"}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="legal" /> {L ? "Saya menyatakan data diperoleh secara sah sesuai lisensi/ketentuan sumber" : "I confirm the data was obtained lawfully under the source's licence/terms"}</label>
            <div className="md:col-span-2"><button className="btn-primary" type="submit">{L ? "Impor" : "Import"}</button>
              <span className="ml-3 text-xs text-slate-500">{L ? "Kolom dikenali otomatis: Source Title, Print-ISSN, E-ISSN, Active or Inactive, Publisher, Sourceid, SJR Best Quartile, Authentic URL, Hijacked URL, …" : "Columns auto-detected: Source Title, Print-ISSN, E-ISSN, Active or Inactive, Publisher, Sourceid, SJR Best Quartile, Authentic URL, Hijacked URL, …"}</span></div>
          </form></CardBody></Card>
      )}
      <Card><CardHeader title={L ? "Dataset terimpor" : "Imported datasets"} /><div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className="th">{L ? "Jenis" : "Kind"}</th><th className="th">{L ? "Versi / berkas" : "Version / file"}</th><th className="th">{L ? "Asal-usul" : "Provenance"}</th><th className="th">{L ? "Tgl data" : "Data date"}</th><th className="th">{L ? "Baris" : "Rows"}</th><th className="th">{L ? "Diimpor" : "Imported"}</th><th className="th" /></tr></thead>
        <tbody className="divide-y divide-slate-100">{ds.map((d) => (
          <tr key={d.id}><td className="td"><Pill tone="navy">{d.kind}</Pill>{d.isDemo && <Pill tone="amber" className="ml-1">{L ? "FIKTIF" : "FICTIONAL"}</Pill>}</td><td className="td text-sm">{d.versionLabel}<div className="font-mono text-[11px] text-slate-500">{d.filename} · {d.sha256.slice(0, 10)}…</div></td>
            <td className="td max-w-xs text-xs">{d.provenance}{!d.isComplete && <div className="text-warn">{L ? "tidak lengkap" : "incomplete"}</div>}</td><td className="td text-xs">{fmtDate(d.sourceDate)}</td><td className="td">{d.rowCount}</td><td className="td text-xs">{fmtDate(d.importedAt)}</td>
            <td className="td">{canImport && <form action={toggleDatasetAction}><input type="hidden" name="id" value={d.id} /><button className="btn-outline !px-2 !py-1 text-xs" type="submit">{d.active ? (L ? "Nonaktifkan" : "Deactivate") : (L ? "Aktifkan" : "Activate")}</button></form>}</td></tr>))}
          {ds.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>{L ? "Belum ada dataset diimpor — indeksasi Scopus akan berstatus UNVERIFIED." : "No dataset imported — Scopus indexing will remain UNVERIFIED."}</td></tr>}</tbody></table></div></Card>
    </>
  );
}
