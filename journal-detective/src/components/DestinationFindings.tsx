import { recordFindingAction, retractFindingAction } from "@/app/actions/investigations";
import { findingHistory, activeFindings } from "@/lib/services/destinationFindings";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";

const TONE: Record<string, "red" | "green" | "slate" | "amber"> = { CLONE_CONFIRMED: "red", AUTHENTIC_VERIFIED: "green", MIGRATION_VERIFIED: "green", PLATFORM_VERIFIED: "green", RETRACTED: "slate" };

/** Temuan tujuan permanen per host persis: aktif + riwayat koreksi. Temuan tidak pernah dihapus. */
export async function DestinationFindings({ journalId, back, lang, canEdit, defaultHost }: { journalId: string; back: string; lang: Lang; canEdit: boolean; defaultHost?: string | null }) {
  const [history, { active }] = await Promise.all([findingHistory(journalId), activeFindings(journalId)]);
  const L = lang === "id";
  const activeIds = new Set(active.map((a) => a.id));
  return (
    <Card>
      <CardHeader title={L ? "Temuan tujuan pengiriman (host persis)" : "Submission-destination findings (exact host)"}
        subtitle={L ? "Permanen dan berasal-usul. Penilaian HIJAU jurnal yang asli tidak pernah menghapus temuan klon pada domain lain. Koreksi hanya lewat proses terdokumentasi; riwayat dipertahankan." : "Permanent and sourced. A GREEN assessment of the authentic journal never removes a clone finding on another domain. Corrections only via a documented process; history is preserved."} />
      <CardBody className="space-y-4">
        {history.length === 0 ? <p className="text-sm text-slate-500">{L ? "Belum ada temuan tujuan." : "No destination findings yet."}</p> : (
          <ul className="space-y-2.5">{history.map((f) => (
            <li key={f.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-semibold">{f.host}</code><Pill tone={TONE[f.status]}>{f.status}</Pill>
                {activeIds.has(f.id) ? <Pill tone="navy">{L ? "AKTIF" : "ACTIVE"}</Pill> : <Pill>{L ? "riwayat" : "history"}</Pill>}
                {f.isDemo && <Pill tone="amber">{L ? "FIKTIF" : "FICTIONAL"}</Pill>}
                <span className="ml-auto text-xs text-slate-500">{fmtDate(f.createdAt, true)} · {f.createdByName}</span>
              </div>
              <p className="mt-1.5">{f.basis}</p>
              <p className="mt-1 break-all text-xs text-slate-500">{L ? "Sumber" : "Source"}: {f.sourceName} {f.sourceUrl ? <a className="underline" href={f.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{f.sourceUrl}</a> : f.sourceRef ?? ""}{f.retractsId ? ` · ${L ? "mengoreksi temuan" : "retracts finding"} …${f.retractsId.slice(-6)}` : ""}</p>
              {canEdit && activeIds.has(f.id) && (
                <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-bad">{L ? "Koreksi temuan ini (proses terkontrol)" : "Correct this finding (controlled process)"}</summary>
                  <form action={retractFindingAction} className="mt-2 grid gap-2 md:grid-cols-2">
                    <input type="hidden" name="findingId" value={f.id} /><input type="hidden" name="back" value={back} />
                    <label className="md:col-span-2"><span className="label">{L ? "Rasional koreksi (min. 20 karakter) *" : "Correction rationale (min. 20 chars) *"}</span><textarea className="input" name="rationale" rows={2} required minLength={20} /></label>
                    <label><span className="label">{L ? "URL bukti pendukung" : "Supporting evidence URL"}</span><input className="input" name="sourceUrl" type="url" placeholder="https://" /></label>
                    <label><span className="label">{L ? "atau referensi dokumen" : "or document reference"}</span><input className="input" name="sourceRef" /></label>
                    <div className="md:col-span-2"><button className="btn-danger" type="submit">{L ? "Koreksi (riwayat tetap tersimpan)" : "Correct (history is kept)"}</button></div>
                  </form></details>
              )}
            </li>))}</ul>
        )}
        {canEdit && (
          <details><summary className="cursor-pointer text-sm font-semibold text-navy-700">{L ? "Catat temuan tujuan baru" : "Record a new destination finding"}</summary>
            <form action={recordFindingAction} className="mt-3 grid gap-2 md:grid-cols-2">
              <input type="hidden" name="journalId" value={journalId} /><input type="hidden" name="back" value={back} />
              <label><span className="label">{L ? "Host / URL persis *" : "Exact host / URL *"}</span><input className="input" name="host" required defaultValue={defaultHost ?? ""} /></label>
              <label><span className="label">{L ? "Temuan *" : "Finding *"}</span><select className="input" name="status">
                <option value="CLONE_CONFIRMED">{L ? "Klon/dibajak — TERKONFIRMASI" : "Clone/hijacked — CONFIRMED"}</option><option value="AUTHENTIC_VERIFIED">{L ? "Situs otentik terverifikasi" : "Authentic site verified"}</option>
                <option value="MIGRATION_VERIFIED">{L ? "Migrasi domain sah terverifikasi" : "Authorized migration verified"}</option><option value="PLATFORM_VERIFIED">{L ? "Platform pengiriman eksternal terverifikasi" : "External submission platform verified"}</option></select></label>
              <label className="md:col-span-2"><span className="label">{L ? "Dasar temuan (min. 10 karakter) *" : "Basis (min. 10 chars) *"}</span><input className="input" name="basis" required minLength={10} /></label>
              <label><span className="label">{L ? "Nama sumber *" : "Source name *"}</span><input className="input" name="sourceName" required /></label>
              <label><span className="label">{L ? "URL sumber" : "Source URL"}</span><input className="input" name="sourceUrl" type="url" placeholder="https://" /></label>
              <label><span className="label">{L ? "atau referensi dokumen" : "or document reference"}</span><input className="input" name="sourceRef" /></label>
              <label><span className="label">{L ? "Tanggal data sumber" : "Source data date"}</span><input className="input" type="date" name="sourceDataDate" /></label>
              <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="includeSubdomains" /> {L ? "Host ini mencakup subdomainnya (hanya untuk temuan 'otentik')" : "This host includes its subdomains (only for 'authentic' findings)"}</label>
              <div className="md:col-span-2"><button className="btn-primary" type="submit">{L ? "Catat temuan" : "Record finding"}</button></div>
            </form></details>
        )}
      </CardBody>
    </Card>
  );
}
