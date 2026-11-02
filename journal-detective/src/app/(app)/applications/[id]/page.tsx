import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, CheckCircle2, Circle, XCircle, MinusCircle, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { reasonText, actionText } from "@/lib/i18n";
import { prisma } from "@/lib/db";
import { evaluateApplication } from "@/lib/services/applications";
import { getActivePolicy } from "@/lib/services/policyService";
import { requiredDocsFor } from "@/lib/engine/checklist";
import { ACTION_ROLES, type ReviewActionType } from "@/lib/engine/approval";
import { DOC_TYPES, STAGES, type DocType, type Stage } from "@/lib/engine/types";
import { parseJson } from "@/lib/engine/util";
import type { ExtractedFields } from "@/lib/engine/extract";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { StatusBadge, TrafficCard, Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";
import {
  uploadDocumentAction, updateStageAction, addEventAction, setChecklistAction, saveFieldsAction, resolveFlagAction, reviewActionAction, purgeDocsAction,
} from "@/app/actions/applications";
import { createDraftAction } from "@/app/actions/letters";

export const dynamic = "force-dynamic";

const EVENT_TYPES = ["SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED", "REVISION_SUBMITTED", "ACCEPTED", "PAYMENT_REQUESTED", "PUBLISHED", "OTHER"];
const ACTIONS: ReviewActionType[] = ["START_REVIEW", "REQUEST_EVIDENCE", "RETURN_FOR_REVISION", "REASSESS", "ESCALATE", "RECOMMEND_APPROVE", "RECOMMEND_REJECT", "APPROVE", "REJECT"];

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser();
  const [{ id }, sp, { lang, t }] = await Promise.all([params, searchParams, getT()]);
  const app = await prisma.application.findUnique({
    where: { id },
    include: { documents: { orderBy: { createdAt: "asc" } }, events: { orderBy: { occurredAt: "asc" } }, checklist: true, flags: { orderBy: { createdAt: "asc" } }, actions: { include: { actor: true }, orderBy: { createdAt: "desc" } }, letters: true, assessment: true },
  });
  if (!app) notFound();
  if (user.role === "STUDENT" && app.studentUserId !== user.id) notFound();
  const L = lang === "id";
  const staff = user.role !== "STUDENT";
  const reviewer = user.role === "REVIEWER" || user.role === "HEAD";
  const [ev, policy] = await Promise.all([evaluateApplication(app), getActivePolicy()]);
  const required = requiredDocsFor(app.stage as Stage, policy.config);
  const checklistRows: DocType[] = Array.from(new Set([...required, ...app.checklist.map((c) => c.docType as DocType)]));
  const done = app.workflow === "APPROVED" || app.workflow === "REJECTED";
  const allowed = ACTIONS.filter((a) => ACTION_ROLES[a].includes(user.role));
  const stageIdx = STAGES.indexOf(app.stage as Stage);
  const messages = app.actions.filter((a) => ["REQUEST_EVIDENCE", "RETURN_FOR_REVISION"].includes(a.action));

  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}{sp.error && <Notice kind="error">{sp.error}</Notice>}
      <PageHeader title={app.manuscriptTitle} subtitle={`${app.refNumber} · ${app.studentName} (${app.studentNumber}) · ${app.studyProgram} · ${L ? "Pembimbing" : "Supervisor"}: ${app.supervisor}`}
        actions={<Pill tone="navy">{t(`wf.${app.workflow}`)}</Pill>} />

      {/* Tiga dimensi — selalu terpisah */}
      <div className="grid gap-4 md:grid-cols-3">
        {ev.journal ? <TrafficCard lang={lang} title={t("dim.journal")} status={ev.journal.journalStatus} headline={t(`status.${ev.journal.journalStatus}.long`)} detail={ev.journal.redCategory ? t(`red.${ev.journal.redCategory}`) : app.journalName} /> : <div className="card p-4 text-sm">—</div>}
        <TrafficCard lang={lang} title={t("dim.admin")} status={ev.administrative.status} headline={t(`status.${ev.administrative.status}.app`)} detail={`${t(`stage.${app.stage}`)}`} />
        {ev.final && <TrafficCard lang={lang} title={t("dim.final")} status={ev.final.status} headline={t(`status.${ev.final.status}.app`)} detail={ev.final.hardBlock ? (L ? "Diblokir — tidak dapat di-override" : "Blocked — cannot be overridden") : ev.final.clearanceBlocked ? (L ? "Diblokir" : "Blocked") : undefined} />}
      </div>

      {ev.final?.hardBlock && (
        <div role="alert" className="mt-4 rounded-xl border-2 border-red-400 bg-bad-soft p-4 text-sm font-semibold text-bad-ink">
          {L ? "Peringatan keamanan: situs/identitas jurnal yang diajukan terkonfirmasi tiruan. Dokumen penerimaan atau pembayaran, sevalid apa pun, tidak mengesampingkan hal ini. Jangan melakukan pembayaran." : "Security warning: the submitted journal website/identity is a confirmed clone. Acceptance or payment documents, however valid, do not override this. Do not make any payment."}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title={L ? "Alasan rekomendasi" : "Reasons for the recommendation"} subtitle={L ? "Dua dimensi dinilai terpisah lalu digabung secara transparan." : "Two dimensions are assessed separately and combined transparently."} />
            <CardBody className="space-y-4">
              {staff && ev.journal && (<div><div className="label">{t("dim.journal")}</div><ul className="space-y-1.5 text-sm">{ev.journal.reasons.map((r, i) => <li key={i} className="flex gap-2"><StatusBadge status={r.level} lang={lang} className="h-fit shrink-0" /><span>{reasonText(lang, r)}</span></li>)}</ul>
                {app.assessmentId && <Link className="mt-2 inline-block text-sm text-navy-700 underline" href={`/investigations/${app.assessmentId}`}>{L ? "Buka investigasi jurnal lengkap →" : "Open full journal investigation →"}</Link>}</div>)}
              <div><div className="label">{t("dim.admin")}</div><ul className="space-y-1.5 text-sm">{ev.administrative.reasons.map((r, i) => <li key={i} className="flex gap-2"><StatusBadge status={r.level} lang={lang} className="h-fit shrink-0" /><span>{reasonText(lang, r)}</span></li>)}</ul></div>
              {ev.final && <div><div className="label">{t("dim.final")}</div><ul className="space-y-1.5 text-sm">{ev.final.reasons.map((r, i) => <li key={i} className="flex gap-2"><StatusBadge status={r.level} lang={lang} className="h-fit shrink-0" /><span>{reasonText(lang, r)}</span></li>)}</ul></div>}
              {staff && ev.journal && <div><div className="label">{L ? "Tindakan yang disarankan" : "Suggested actions"}</div><ol className="list-decimal space-y-1 pl-5 text-sm">{ev.journal.nextActions.map((x) => <li key={x.code}>{actionText(lang, x)}</li>)}</ol></div>}
              {!staff && ev.journal && ev.final?.status !== "GREEN" && <p className="text-sm text-slate-700">{L ? "Peninjau akan menghubungi Anda bila perlu klarifikasi. Pesan peninjau muncul di bawah." : "A reviewer will contact you if clarification is needed. Reviewer messages appear below."}</p>}
            </CardBody>
          </Card>

          {messages.length > 0 && (
            <Card><CardHeader title={L ? "Permintaan klarifikasi / bukti dari peninjau" : "Clarification / evidence requests from reviewers"} /><CardBody>
              <ul className="space-y-3 text-sm">{messages.map((m) => <li key={m.id} className="rounded-lg border border-amber-200 bg-warn-soft p-3"><div className="text-xs font-semibold text-warn-ink">{t(`act.${m.action}`)} · {fmtDate(m.createdAt, true)} · {m.actor.name}</div><p className="mt-1 whitespace-pre-line">{m.rationale}</p></li>)}</ul>
            </CardBody></Card>
          )}

          {/* Daftar periksa bukti interaktif */}
          <Card><CardHeader title={L ? "Daftar periksa bukti (tahap: " + t(`stage.${app.stage}`) + ")" : "Evidence checklist (stage: " + t(`stage.${app.stage}`) + ")"} subtitle={L ? "Hanya bukti yang relevan dengan tahap yang diklaim." : "Only evidence relevant to the claimed stage."} />
            <div id="daftar-bukti" className="divide-y divide-slate-100">
              {checklistRows.length === 0 && <p className="p-5 text-sm text-slate-600">{t("admin.admin_no_stage_evidence_required")}</p>}
              {checklistRows.map((d) => {
                const item = app.checklist.find((c) => c.docType === d);
                const docs = app.documents.filter((x) => x.docType === d);
                const st = item?.status ?? "UNVERIFIED";
                const Icon = st === "MET" ? CheckCircle2 : st === "UNMET" ? XCircle : st === "NOT_APPLICABLE" ? MinusCircle : Circle;
                const tone = st === "MET" ? "text-ok" : st === "UNMET" ? "text-bad" : "text-slate-400";
                return (
                  <div key={d} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Icon className={`h-5 w-5 shrink-0 ${tone}`} aria-hidden />
                    <div className="min-w-[200px] flex-1">
                      <div className="text-sm font-semibold">{t(`doc.${d}`)} {!required.includes(d) && <Pill className="ml-1">{L ? "tambahan" : "extra"}</Pill>}</div>
                      <div className="text-xs text-slate-500">{docs.length ? `${docs.length} ${L ? "berkas" : "file(s)"}` : t("docstatus.MISSING")} · {t(`docstatus.${st}`)}{item?.note ? ` · ${item.note}` : ""}</div>
                    </div>
                    {reviewer && !done && (
                      <form action={setChecklistAction} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="docType" value={d} />
                        <select className="input !w-auto !py-1 text-xs" name="status" defaultValue={st} aria-label="status"><option value="UNVERIFIED">{t("docstatus.UNVERIFIED")}</option><option value="MET">{t("docstatus.MET")}</option><option value="UNMET">{t("docstatus.UNMET")}</option><option value="NOT_APPLICABLE">{t("docstatus.NOT_APPLICABLE")}</option></select>
                        <input className="input !w-40 !py-1 text-xs" name="note" placeholder={L ? "catatan" : "note"} defaultValue={item?.note ?? ""} aria-label="note" />
                        <button className="btn-outline !px-2.5 !py-1 text-xs" type="submit">OK</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Dokumen */}
          <Card><CardHeader title={L ? "Dokumen bukti" : "Evidence documents"} subtitle={L ? "Hasil ekstraksi otomatis dapat dikoreksi manusia; periksa selalu dokumen asli." : "Auto-extracted details are correctable by humans; always inspect the original document."} />
            <div id="dokumen" className="divide-y divide-slate-100">
              {app.documents.length === 0 && <p className="p-5 text-sm text-slate-500">—</p>}
              {app.documents.map((d) => {
                const f = parseJson<ExtractedFields>(d.fieldsJson, {} as ExtractedFields);
                return (
                  <div key={d.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-navy-600" aria-hidden />
                      <span className="text-sm font-semibold">{d.filename}</span><Pill tone="navy">{t(`doc.${d.docType}`)}</Pill>
                      <span className="text-xs text-slate-500">{(d.size / 1024).toFixed(0)} KB · {fmtDate(d.createdAt, true)} · sha256 {d.sha256.slice(0, 10)}…</span>
                      {d.fieldsReviewed ? <Pill tone="green">{L ? "ekstraksi ditinjau" : "extraction reviewed"}</Pill> : staff && <Pill tone="amber">{L ? "ekstraksi belum ditinjau" : "extraction unreviewed"}</Pill>}
                      {staff && user.role !== "ADMIN" && <a className="ml-auto btn-outline !px-2.5 !py-1 text-xs" href={`/api/documents/${d.id}`}><Download className="h-3.5 w-3.5" aria-hidden /> {L ? "Dokumen asli" : "Original"}</a>}
                      {!staff && <a className="ml-auto btn-outline !px-2.5 !py-1 text-xs" href={`/api/documents/${d.id}`}><Download className="h-3.5 w-3.5" aria-hidden /> {L ? "Unduh" : "Download"}</a>}
                    </div>
                    {staff && user.role !== "ADMIN" && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-navy-700">{L ? "Periksa / koreksi hasil ekstraksi" : "Inspect / correct extraction"}</summary>
                        <p className="mt-1 text-xs text-slate-500">{d.extractionNote}</p>
                        {d.extractedText && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-700">{d.extractedText.slice(0, 3000)}</pre>}
                        {reviewer && (
                          <form action={saveFieldsAction} className="mt-2 grid gap-2 md:grid-cols-2">
                            <input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="documentId" value={d.id} />
                            <label><span className="label">{L ? "ID naskah" : "Manuscript ID"}</span><input className="input" name="manuscriptId" defaultValue={f.manuscriptId ?? ""} /></label>
                            <label><span className="label">{L ? "Judul naskah" : "Manuscript title"}</span><input className="input" name="title" defaultValue={f.title ?? ""} /></label>
                            <label><span className="label">{L ? "Nama jurnal" : "Journal name"}</span><input className="input" name="journalName" defaultValue={f.journalName ?? ""} /></label>
                            <label><span className="label">ISSN</span><input className="input" name="issns" defaultValue={(f.issns ?? []).join(", ")} /></label>
                            <label><span className="label">DOI</span><input className="input" name="dois" defaultValue={(f.dois ?? []).join(", ")} /></label>
                            <label><span className="label">{L ? "Surel" : "Emails"}</span><input className="input" name="emails" defaultValue={(f.emails ?? []).join(", ")} /></label>
                            <label><span className="label">{L ? "Domain" : "Domains"}</span><input className="input" name="domains" defaultValue={(f.domains ?? []).join(", ")} /></label>
                            <label><span className="label">{L ? "Tanggal" : "Dates"}</span><input className="input" name="dates" defaultValue={(f.dates ?? []).join(", ")} /></label>
                            <label className="md:col-span-2"><span className="label">{L ? "Jumlah / tagihan" : "Amounts"}</span><input className="input" name="amounts" defaultValue={(f.amounts ?? []).join(", ")} /></label>
                            <div className="md:col-span-2"><button className="btn-primary" type="submit">{L ? "Simpan koreksi & tandai ditinjau" : "Save corrections & mark reviewed"}</button></div>
                          </form>
                        )}
                      </details>
                    )}
                  </div>
                );
              })}
              {!done && (
                <form action={uploadDocumentAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-3 bg-slate-50 px-5 py-4">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <label><span className="label">{L ? "Jenis" : "Type"}</span><select className="input" name="docType" defaultValue={required[0] ?? "OTHER"}>{DOC_TYPES.map((d) => <option key={d} value={d}>{t(`doc.${d}`)}</option>)}</select></label>
                  <label className="min-w-[200px] flex-1"><span className="label">{L ? "Berkas (PDF/PNG/JPG/TXT/EML/DOCX, maks 10 MB)" : "File (PDF/PNG/JPG/TXT/EML/DOCX, max 10 MB)"}</span><input className="input" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.txt,.eml,.docx" /></label>
                  <button className="btn-primary" type="submit"><Upload className="h-4 w-4" aria-hidden /> {L ? "Unggah" : "Upload"}</button>
                </form>
              )}
            </div>
          </Card>

          {/* Tanda peninjauan */}
          <Card><CardHeader title={L ? "Tanda peninjauan (ketidakkonsistenan & anomali proses)" : "Review flags (inconsistencies & process anomalies)"} subtitle={L ? "Tanda adalah petunjuk untuk ditinjau, BUKAN bukti pemalsuan." : "Flags are prompts for review, NOT proof of forgery."} />
            <CardBody><div id="tanda" className="space-y-2.5">
              {app.flags.length === 0 && <p className="text-sm text-slate-500">{L ? "Tidak ada tanda." : "No flags."}</p>}
              {app.flags.map((f) => (
                <div key={f.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2"><Pill tone={f.severity === "HIGH" ? "red" : f.severity === "MEDIUM" ? "amber" : "slate"}>{t(`sev.${f.severity}`)}</Pill><Pill tone={f.state === "OPEN" ? "amber" : f.state === "CONFIRMED" ? "red" : "green"}>{f.state}</Pill><code className="text-[11px] text-slate-400">{f.code}</code></div>
                  <p className="mt-1.5 text-sm">{f.message}</p>
                  {f.note && <p className="mt-1 text-xs text-slate-600">{L ? "Catatan peninjau" : "Reviewer note"}: {f.note}</p>}
                  {reviewer && f.state === "OPEN" && !done && (
                    <form action={resolveFlagAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="flagId" value={f.id} />
                      <label className="min-w-[200px] flex-1"><span className="label">{L ? "Catatan (min. 10 karakter)" : "Note (min. 10 chars)"}</span><input className="input" name="note" required minLength={10} /></label>
                      <button className="btn-danger" name="state" value="CONFIRMED" type="submit">{L ? "Konfirmasi masalah serius" : "Confirm serious issue"}</button>
                      <button className="btn-outline" name="state" value="DISMISSED" type="submit">{L ? "Tolak (wajar)" : "Dismiss (benign)"}</button>
                    </form>
                  )}
                </div>
              ))}
            </div></CardBody></Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {/* Linimasa */}
          <Card><CardHeader title={L ? "Linimasa proses editorial" : "Editorial-process timeline"} />
            <CardBody>
              <ol aria-label="stages" className="mb-4 flex flex-wrap gap-1">{STAGES.map((s, i) => <li key={s} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${i < stageIdx ? "border-green-300 bg-ok-soft text-ok-ink" : i === stageIdx ? "border-navy-700 bg-navy-800 text-white" : "border-slate-200 text-slate-400"}`}>{t(`stage.${s}`)}</li>)}</ol>
              <div id="linimasa"><ol className="relative ml-2 space-y-3 border-l-2 border-navy-200 pl-5">
                {app.events.length === 0 && <li className="text-xs text-slate-500">{app.stage === "PRE_SUBMISSION" ? (L ? "Pra-pengiriman: belum ada peristiwa — tidak dituntut." : "Pre-submission: no events yet — none demanded.") : "—"}</li>}
                {app.events.map((e) => (<li key={e.id} className="text-xs"><span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-white bg-navy-500" aria-hidden /><div className="font-semibold">{fmtDate(e.occurredAt)} · {e.type}</div>{e.note && <div className="text-slate-600">{e.note}</div>}</li>))}
              </ol></div>
              {!done && (
                <form action={addEventAction} className="mt-4 grid gap-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <div className="grid grid-cols-2 gap-2"><select className="input" name="type" aria-label="type">{EVENT_TYPES.map((x) => <option key={x}>{x}</option>)}</select><input className="input" type="date" name="occurredAt" required aria-label="date" /></div>
                  <input className="input" name="note" placeholder={L ? "catatan (opsional)" : "note (optional)"} aria-label="note" />
                  <button className="btn-outline" type="submit">{L ? "Tambah peristiwa" : "Add event"}</button>
                </form>
              )}
              {!done && (
                <form action={updateStageAction} className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <select className="input" name="stage" defaultValue={app.stage} aria-label="stage">{STAGES.map((s) => <option key={s} value={s}>{t(`stage.${s}`)}</option>)}</select>
                  <button className="btn-outline" type="submit">{L ? "Ubah tahap" : "Set stage"}</button>
                </form>
              )}
            </CardBody></Card>

          {/* Info jurnal & pengiriman */}
          <Card><CardHeader title={L ? "Data permohonan" : "Application data"} /><CardBody className="space-y-1.5 text-sm">
            <div><span className="label">{L ? "Jurnal" : "Journal"}</span>{app.journalName} {app.journalIssn && <span className="text-slate-500">({app.journalIssn})</span>}</div>
            <div><span className="label">{L ? "URL diajukan" : "Submitted URL"}</span><span className="break-all font-mono text-xs">{app.journalUrl ?? "—"}</span></div>
            <div><span className="label">{L ? "Klaim" : "Claims"}</span>{app.claimedIndexing ?? "—"} {app.claimedQuartile && `· ${app.claimedQuartile}`}</div>
            <div><span className="label">{L ? "ID pelacakan" : "Tracking ID"}</span>{app.trackingId ?? "—"}</div>
            <div><span className="label">{L ? "Tanggal pengiriman" : "Submission date"}</span>{fmtDate(app.submissionDate)}</div>
          </CardBody></Card>

          {/* Tindakan peninjauan */}
          {staff && allowed.length > 0 && !done && user.role !== "ADMIN" && (
            <Card><CardHeader title={L ? "Tindakan peninjauan" : "Review actions"} subtitle={L ? "Tiap tindakan mencatat pelaku, waktu, alasan, dan versi kebijakan." : "Every action records actor, time, rationale and policy version."} />
              <CardBody><div id="tindakan">
                <form action={reviewActionAction} className="space-y-3">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <label><span className="label">{L ? "Tindakan" : "Action"}</span><select className="input" name="action">{allowed.map((a) => <option key={a} value={a}>{t(`act.${a}`)}</option>)}</select></label>
                  <label><span className="label">{L ? "Alasan / pesan (wajib; untuk persetujuan non-HIJAU berfungsi sebagai justifikasi override)" : "Rationale / message (required; for non-GREEN approvals it is the override justification)"}</span><textarea className="input" name="rationale" rows={4} required minLength={10} /></label>
                  <button className="btn-primary" type="submit">{L ? "Catat tindakan" : "Record action"}</button>
                  {ev.final && ev.final.status !== "GREEN" && user.role === "HEAD" && <p className="text-xs text-warn-ink">{ev.final.hardBlock ? (L ? "Persetujuan diblokir untuk identitas palsu terkonfirmasi." : "Approval is blocked for confirmed identity fraud.") : ev.final.clearanceBlocked && !ev.final.overridableByHead ? (L ? "Hasil MERAH tidak dapat di-override." : "A RED result cannot be overridden.") : (L ? "Persetujuan non-HIJAU akan tercatat sebagai OVERRIDE bersertifikat justifikasi." : "A non-GREEN approval will be recorded as a documented OVERRIDE.")}</p>}
                </form></div>
              </CardBody></Card>
          )}
          {app.overrideJson && (() => { const o = parseJson<any>(app.overrideJson, {}); return (
            <Card><CardHeader title={L ? "Override terdokumentasi" : "Documented override"} /><CardBody className="text-sm"><p>{o.justification}</p><p className="mt-1 text-xs text-slate-500">{o.by} · {fmtDate(o.at, true)} · {L ? "kebijakan v" : "policy v"}{o.policyVersion} · {L ? "rekomendasi sistem" : "system recommendation"}: {o.finalStatus}</p></CardBody></Card>); })()}

          <Card><CardHeader title={L ? "Riwayat tindakan" : "Action history"} /><CardBody>
            {app.actions.length === 0 ? <p className="text-sm text-slate-500">—</p> : <ol className="space-y-2.5 text-xs">{app.actions.map((a) => (<li key={a.id} className="border-l-2 border-navy-200 pl-3"><div className="font-semibold">{t(`act.${a.action}`)} <span className="font-normal text-slate-500">· {a.actor.name} ({t(`role.${a.actor.role}`)}) · {fmtDate(a.createdAt, true)} · {L ? "kebijakan v" : "policy v"}{a.policyVersion}</span></div>{staff && <p className="mt-0.5 whitespace-pre-line text-slate-700">{a.rationale}</p>}</li>))}</ol>}
          </CardBody></Card>

          {staff && (
            <Card><CardHeader title={L ? "Surat klirens" : "Clearance letters"} subtitle={L ? "Draf selalu berwatermark. Surat resmi hanya oleh Kepala Unit setelah persetujuan." : "Drafts are always watermarked. Official letters only by the Head after approval."} /><CardBody className="space-y-3">
              {app.letters.map((l) => <div key={l.id} className="flex items-center justify-between text-sm"><Link className="text-navy-700 underline" href={`/letters/${l.id}`}>{t(`letter.${l.type}`)}</Link><Pill tone={l.status === "ISSUED" ? "green" : "amber"}>{t(`letter.${l.status}`)}</Pill></div>)}
              <div className="flex flex-wrap gap-2">
                {(["PRE_SUBMISSION", "POST_ACCEPTANCE_PAYMENT"] as const).map((ty) => (
                  <form key={ty} action={createDraftAction}><input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="type" value={ty} /><button className="btn-outline text-xs" type="submit">{L ? "Buat draf: " : "Create draft: "}{t(`letter.${ty}`)}</button></form>
                ))}
              </div>
            </CardBody></Card>
          )}
          {(user.role === "ADMIN" || user.role === "HEAD") && app.documents.length > 0 && (
            <Card><CardHeader title={L ? "Retensi & penghapusan" : "Retention & deletion"} /><CardBody>
              <form action={purgeDocsAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="applicationId" value={app.id} />
                <label className="min-w-[180px] flex-1"><span className="label">{L ? "Alasan" : "Reason"}</span><input className="input" name="reason" required placeholder={L ? "mis. masa retensi berakhir" : "e.g., retention period ended"} /></label>
                <button className="btn-danger" type="submit">{L ? "Hapus permanen semua berkas" : "Permanently delete all files"}</button></form>
            </CardBody></Card>
          )}
        </div>
      </div>
    </>
  );
}
