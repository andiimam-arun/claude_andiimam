import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, RefreshCw, Flag, Globe, Sparkles, ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { reasonText, actionText } from "@/lib/i18n";
import { loadAssessment } from "@/lib/services/investigation";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/card";
import { StatusBadge, TrafficCard, Pill } from "@/components/StatusBadge";
import { EvidenceList } from "@/components/EvidenceList";
import { ManualEvidenceForm } from "@/components/ManualEvidenceForm";
import { reassessJournalAction, flagReassessAction, snapshotSiteAction, aiSummaryAction } from "@/app/actions/investigations";
import { fmtDate } from "@/lib/utils";
import { getAiProvider } from "@/lib/services/ai";
import { DestinationFindings } from "@/components/DestinationFindings";

export const dynamic = "force-dynamic";

export default async function InvestigationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireRole("REVIEWER", "HEAD", "ADMIN");
  const [{ id }, sp, { lang, t }] = await Promise.all([params, searchParams, getT()]);
  const data = await loadAssessment(id);
  if (!data) notFound();
  const { assessment: a, journal: j, evidence, decision: d } = data;
  const L = lang === "id";
  const canAct = user.role === "REVIEWER" || user.role === "HEAD";
  const back = `/investigations/${a.id}`;
  const hj = evidence.find((e) => e.key === "hijack.website");
  const officials: string[] = (hj?.data.officialDomains as string[]) ?? [];
  const sub = a.submittedDomain;
  const prev = await prisma.assessment.findMany({ where: { journalId: j.id, id: { not: a.id } }, orderBy: { createdAt: "desc" }, take: 6 });
  const byKey = (k: string) => evidence.filter((e) => e.key === k);
  const timeline = [...evidence].sort((x, y) => x.retrievedAt.localeCompare(y.retrievedAt));
  const isStale = a.createdAt.getTime() < Date.now() - 86_400_000;
  const ai = getAiProvider();

  const webTone = d.destinationStatus;
  const idxTone = d.indexingStatus === "ACTIVE_VERIFIED" ? "GREEN" : d.indexingStatus === "DISCONTINUED_VERIFIED" || d.indexingStatus === "NOT_LISTED_CONCLUSIVE" ? "RED" : "YELLOW";
  const predTone = d.predatoryAssessment === "CONFIRMED_VIOLATION" ? "RED" : d.predatoryAssessment === "REVIEW_REQUIRED" || d.predatoryAssessment === "NOT_ASSESSED" ? "YELLOW" : "GREEN";
  const eligTone = d.policyEligibility === "ELIGIBLE" ? "GREEN" : d.policyEligibility === "INELIGIBLE" ? "RED" : "YELLOW";

  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      {/* Header identitas */}
      <div className={`mb-6 overflow-hidden rounded-2xl border-2 ${d.journalStatus === "GREEN" ? "border-green-400" : d.journalStatus === "YELLOW" ? "border-amber-400" : "border-red-400"} bg-white shadow-card`}>
        <div className={`flex flex-wrap items-center justify-between gap-4 px-6 py-5 ${d.journalStatus === "GREEN" ? "bg-ok-soft" : d.journalStatus === "YELLOW" ? "bg-warn-soft" : "bg-bad-soft"}`}>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{a.refNumber} · {fmtDate(a.createdAt, true)} · {L ? "kebijakan v" : "policy v"}{a.policyVersion}{j.isDemo ? ` · ${L ? "DATA DEMONSTRASI FIKTIF" : "FICTIONAL DEMO DATA"}` : ""}</div>
            <h1 className="mt-1 text-2xl font-extrabold text-navy-950 sm:text-3xl">{j.title}</h1>
            <p className="mt-1 text-sm text-slate-700">
              ISSN {j.issn ?? "—"} · E-ISSN {j.eissn ?? "—"} · {j.publisher ?? (L ? "penerbit tidak diketahui" : "unknown publisher")}{j.country ? ` · ${j.country}` : ""}{j.scopusSourceId ? ` · Source ID ${j.scopusSourceId}` : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{t("dim.journal")}</div>
            <StatusBadge status={d.journalStatus} lang={lang} className="!px-4 !py-1.5 !text-base" />
            <div className="mt-1.5 text-sm font-bold text-slate-900">{t(`status.${d.journalStatus}.long`)}</div>
            {d.redCategory && <div className="mt-0.5 max-w-xs text-xs font-semibold text-bad-ink">{t(`red.${d.redCategory}`)}</div>}
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2 border-t border-slate-100 px-6 py-3">
          <a className="btn-outline" href={`/api/assessments/${a.id}/report`}><Download className="h-4 w-4" aria-hidden /> {L ? "Unduh laporan (PDF)" : "Download report (PDF)"}</a>
          {canAct && (
            <form action={reassessJournalAction}><input type="hidden" name="assessmentId" value={a.id} />
              <button className="btn-outline" type="submit"><RefreshCw className="h-4 w-4" aria-hidden /> {L ? "Nilai ulang" : "Reassess"}</button></form>
          )}
          {canAct && (
            <form action={flagReassessAction} className="flex gap-2"><input type="hidden" name="journalId" value={j.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="reason" value="Ditandai dari halaman investigasi" />
              <button className="btn-outline" type="submit"><Flag className="h-4 w-4" aria-hidden /> {j.reassessFlag ? (L ? "Sudah ditandai" : "Flagged") : (L ? "Tandai penilaian ulang berkala" : "Flag for periodic reassessment")}</button></form>
          )}
          {canAct && (
            <form action={aiSummaryAction}><input type="hidden" name="assessmentId" value={a.id} />
              <button className="btn-outline" type="submit" disabled={!ai.enabled} title={ai.enabled ? "" : "ANTHROPIC_API_KEY belum dikonfigurasi"}><Sparkles className="h-4 w-4" aria-hidden /> {L ? "Ringkasan AI (penasihat)" : "AI summary (advisory)"}</button></form>
          )}
          <Link className="ml-auto text-sm font-medium text-navy-700 underline" href={`/journals/${j.id}`}>{"Journal Passport"} →</Link>
        </div>
        {isStale && <div className="border-t border-amber-200 bg-warn-soft px-6 py-2 text-xs font-medium text-warn-ink">{L ? `Penilaian ini berusia ${Math.floor((Date.now() - a.createdAt.getTime()) / 86_400_000)} hari. Bukti sensitif waktu perlu divalidasi ulang sebelum dipakai untuk keputusan.` : `This assessment is ${Math.floor((Date.now() - a.createdAt.getTime()) / 86_400_000)} days old. Time-sensitive evidence should be revalidated before use.`}</div>}
      </div>

      {/* Kartu status */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TrafficCard lang={lang} title={t("dim.destination")} status={webTone} headline={t(`web.${d.websiteStatus}`)} detail={d.destinationHost ?? (sub ? `${sub}` : L ? "tidak diberikan" : "not provided")} />
        <TrafficCard lang={lang} title={L ? "Indeksasi Scopus" : "Scopus indexing"} status={idxTone} headline={t(`idx.${d.indexingStatus}`)} detail={d.indexingBasis ? `${t(`integ.${d.indexingBasis}`)} · ${L ? "data" : "data"} ${fmtDate(d.indexingDataDate)}` : L ? "tanpa basis bukti" : "no evidentiary basis"} />
        <TrafficCard lang={lang} title={L ? "Kelayakan kebijakan" : "Policy eligibility"} status={eligTone} headline={t(`elig.${d.policyEligibility}`)} detail={`${L ? "Identitas" : "Identity"}: ${t(`ident.${d.identityStatus}`)}`} />
        <TrafficCard lang={lang} title={L ? "Risiko penerbitan predator" : "Predatory-publishing risk"} status={predTone} headline={t(`pred.${d.predatoryAssessment}`)} detail={L ? "Daftar Beall hanya pemicu tinjauan" : "Beall list only triggers review"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {/* Alasan */}
          <Card>
            <CardHeader title={L ? "Alasan penilaian" : "Reasons for assessment"} subtitle={L ? "Setiap alasan dihasilkan aturan transparan (docs/ASSESSMENT_POLICY.md)" : "Every reason is produced by transparent rules (docs/ASSESSMENT_POLICY.md)"} />
            <CardBody>
              <ul className="space-y-2">
                {[...d.reasons.filter((r) => r.scope !== "DESTINATION"), ...d.reasons.filter((r) => r.scope === "DESTINATION")].map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-sm"><StatusBadge status={r.level} lang={lang} className="mt-0.5 h-fit shrink-0" /><span>{r.scope === "DESTINATION" && <b className="mr-1 text-[11px] uppercase text-slate-500">[{L ? "tujuan" : "destination"}]</b>}{reasonText(lang, r)}</span></li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {/* Perbandingan situs */}
          <Card>
            <CardHeader title={L ? "Situs otentik vs situs yang diajukan" : "Authentic vs submitted website"} subtitle={L ? "Domain resmi ditetapkan dari sumber independen, bukan dari mahasiswa." : "The official domain is established from independent sources, not from the student."} />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-green-300 bg-ok-soft p-3"><div className="label !mb-1">{L ? "Domain resmi terverifikasi" : "Verified official domain"}</div>
                {officials.length ? officials.map((o) => <div key={o} className="font-mono text-sm font-semibold text-ok-ink">{o}</div>) : <div className="text-sm text-slate-700">{L ? "Belum ditetapkan — tidak ada dugaan; tambahkan bukti domain resmi." : "Not yet established — no assumption made; add official-domain evidence."}</div>}</div>
              <div className={`rounded-lg border p-3 ${webTone === "RED" ? "border-red-400 bg-bad-soft" : webTone === "GREEN" ? "border-green-300 bg-ok-soft" : "border-amber-300 bg-warn-soft"}`}>
                <div className="label !mb-1">{L ? "Tujuan diajukan (host persis)" : "Submitted destination (exact host)"}</div>
                <div className="font-mono text-sm font-semibold">{d.destinationHost ?? sub ?? "—"}</div>
                <div className="mt-1.5"><StatusBadge status={webTone} lang={lang} /> <span className="ml-1 text-xs font-semibold">{t(`web.${d.websiteStatus}`)}</span></div>
                {d.websiteStatus === "UNSAFE_CONFIRMED_CLONE" && <p className="mt-2 text-xs font-bold text-bad-ink">{L ? "TIDAK AMAN — jangan kirim naskah/pembayaran lewat situs ini." : "UNSAFE — do not submit manuscripts/payments through this site."}</p>}
              </div>
              {canAct && a.submittedUrl && (
                <form action={snapshotSiteAction} className="sm:col-span-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="journalId" value={j.id} /><input type="hidden" name="url" value={a.submittedUrl} /><input type="hidden" name="back" value={back} />
                  <button className="btn-outline" type="submit"><Globe className="h-4 w-4" aria-hidden /> {L ? "Ambil & periksa beranda situs yang diajukan" : "Fetch & inspect submitted homepage"}</button>
                  <span className="text-xs text-slate-500">{L ? "Tindakan eksplisit; aman SSRF; isi halaman diperlakukan sebagai data tidak tepercaya." : "Explicit action; SSRF-safe; page content is treated as untrusted data."}</span>
                </form>
              )}
            </CardBody>
          </Card>

          <DestinationFindings journalId={j.id} back={back} lang={lang} canEdit={canAct} defaultHost={d.destinationHost ?? sub} />

          {/* Kartu verifikasi indeksasi */}
          <Card>
            <CardHeader title={L ? "Kartu verifikasi indeksasi" : "Indexing verification cards"} />
            <CardBody className="grid gap-3 sm:grid-cols-3">
              {([["Scopus", byKey("scopus.coverage")], ["SCImago", byKey("scimago.entry")], ["DOAJ / Crossref", [...byKey("metadata.doaj"), ...byKey("metadata.crossref")]]] as const).map(([name, items]) => (
                <div key={name} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-sm font-bold text-navy-900">{name}</div>
                  {items.length === 0 ? <p className="mt-1 text-xs text-slate-500">{L ? "Tidak ada catatan" : "No records"}</p> : items.slice(0, 3).map((e) => (
                    <div key={e.fingerprint + (e.id ?? "")} className="mt-2 border-t border-slate-100 pt-2 text-xs">
                      <Pill tone={e.status === "VERIFIED" ? "green" : e.status === "UNAVAILABLE" || e.status === "NOT_FOUND" ? "slate" : "amber"}>{t(`ev.status.${e.status}`)}</Pill>
                      <span className="ml-1 text-slate-500">{t(`integ.${e.integration}`)}</span>
                      <p className="mt-1 text-slate-700">{e.finding}</p>
                    </div>
                  ))}
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Indikator hijack & predator */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card><CardHeader title={L ? "Indikator pembajakan & kloning" : "Hijack & cloning indicators"} /><CardBody>
              {evidence.filter((e) => e.check === "HIJACK").length === 0 ? <p className="text-sm text-slate-500">—</p> : (
                <ul className="space-y-2 text-sm">{evidence.filter((e) => e.check === "HIJACK").map((e) => (<li key={e.fingerprint + (e.id ?? "")} className="flex gap-2"><Pill tone={e.status === "VERIFIED" && e.severity === "CRITICAL" ? "red" : e.status === "REPORTED_UNVERIFIED" ? "amber" : "slate"}>{t(`ev.status.${e.status}`)}</Pill><span>{e.finding}</span></li>))}</ul>)}
            </CardBody></Card>
            <Card><CardHeader title={L ? "Peringatan penerbitan predator" : "Predatory-publishing warnings"} /><CardBody>
              {evidence.filter((e) => e.check === "PREDATORY").length === 0 ? <p className="text-sm text-slate-500">{L ? "Belum ada tinjauan atau daftar rujukan." : "No review or reference list yet."}</p> : (
                <ul className="space-y-2 text-sm">{evidence.filter((e) => e.check === "PREDATORY").map((e) => (<li key={e.fingerprint + (e.id ?? "")} className="flex gap-2"><Pill tone={e.status === "VERIFIED" && e.severity === "CRITICAL" ? "red" : e.requiresHumanConfirmation ? "amber" : "slate"}>{t(`ev.status.${e.status}`)}</Pill><span>{e.finding}</span></li>))}</ul>)}
            </CardBody></Card>
          </div>

          {/* Bukti rinci */}
          <Card>
            <CardHeader title={L ? "Catatan bukti terstruktur" : "Structured evidence records"} subtitle={L ? "Keparahan risiko dipisahkan dari kekuatan bukti. Data hilang bukan bukti negatif." : "Risk severity is separate from evidence strength. Missing data is not negative evidence."} />
            <CardBody><EvidenceList evidence={evidence} journalId={j.id} back={back} lang={lang} canReview={canAct} /></CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={L ? "Tindakan lanjutan yang disarankan" : "Recommended next actions"} />
            <CardBody><ol className="list-decimal space-y-2 pl-5 text-sm">{d.nextActions.map((x) => <li key={x.code}>{actionText(lang, x)}</li>)}</ol></CardBody>
          </Card>
          {a.aiSummary && (
            <Card><CardHeader title={L ? "Ringkasan AI (penasihat)" : "AI summary (advisory)"} subtitle={L ? "Tidak mengubah status keputusan. Periksa terhadap bukti." : "Does not change the decision status. Check against evidence."} /><CardBody><p className="whitespace-pre-line text-sm text-slate-800">{a.aiSummary}</p></CardBody></Card>
          )}
          <Card>
            <CardHeader title={L ? "Linimasa bukti" : "Evidence timeline"} />
            <CardBody>
              <ol className="relative ml-2 space-y-3 border-l-2 border-navy-200 pl-5">
                {timeline.map((e) => (
                  <li key={e.fingerprint + (e.id ?? "")} className="text-xs">
                    <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-white bg-navy-500" aria-hidden />
                    <div className="font-semibold text-slate-800">{fmtDate(e.retrievedAt)} · {t(`check.${e.check}`)}</div>
                    <div className="text-slate-600">{e.finding.slice(0, 110)}{e.finding.length > 110 ? "…" : ""}</div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
          {prev.length > 0 && (
            <Card><CardHeader title={L ? "Penilaian sebelumnya (konteks historis)" : "Previous assessments (historical context)"} /><CardBody>
              <ul className="space-y-1.5 text-sm">{prev.map((p) => (<li key={p.id} className="flex items-center justify-between gap-2"><Link className="text-navy-700 underline" href={`/investigations/${p.id}`}>{p.refNumber} · {fmtDate(p.createdAt)}</Link><StatusBadge status={p.journalStatus as any} lang={lang} /></li>))}</ul>
              <p className="mt-2 text-xs text-slate-500">{L ? "Status lama tidak dipakai ulang; bukti waktu-sensitif divalidasi ulang setiap penilaian." : "Old statuses are not reused; time-sensitive evidence is revalidated at each assessment."}</p>
            </CardBody></Card>
          )}
          {canAct && (
            <Card><CardHeader title={L ? "Tambah bukti manual" : "Add manual evidence"} subtitle={L ? "Mekanisme peninjauan bukti manual terdokumentasi bila sumber otoritatif tidak dapat diakses." : "Documented manual evidence workflow when authoritative sources are not accessible."} />
              <CardBody><ManualEvidenceForm journalId={j.id} back={back} lang={lang} submittedDomain={sub} /></CardBody></Card>
          )}
        </div>
      </div>
      <p className="mt-6 flex items-center gap-1 text-xs text-slate-500"><ExternalLink className="h-3 w-3" aria-hidden /> {t("app.advisory")}</p>
    </>
  );
}
