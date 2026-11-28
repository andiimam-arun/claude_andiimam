import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/engine/util";
import { DIMENSIONS, DISCREPANCY_CLASSES, VALIDATION_CATEGORIES, type ComparisonSummary } from "@/lib/engine/validation";
import { STAGES } from "@/lib/engine/types";
import { SHELL_PREFIX, type SourceRef } from "@/lib/services/validation";
import { recordReferenceAction, runCaseAction, classifyRunAction, resolveCaseAction, updateCaseAction } from "@/app/actions/validation";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
const SRC_PLACEHOLDER = "Halaman penerbit | https://… | 2026-10-01 | 2026-11-02";

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireRole("REVIEWER", "HEAD");
  const [{ id }, sp, { lang, t }] = await Promise.all([params, searchParams, getT()]);
  const c = await prisma.validationCase.findUnique({ where: { id }, include: { references: { orderBy: { version: "desc" } }, runs: { orderBy: { runNo: "desc" }, include: { reference: true } } } });
  if (!c) notFound();
  const L = lang === "id";
  const ref = c.references[0];
  const isShell = c.title.startsWith(SHELL_PREFIX);
  const sources = parseJson<SourceRef[]>(c.sourcesJson, []);
  const cat = VALIDATION_CATEGORIES.find((x) => x.code === c.category);
  const sel = (name: string, dflt = "NOT_ASSESSED") => (
    <select className="input" name={name} defaultValue={dflt}>{["GREEN", "YELLOW", "RED", "NOT_ASSESSED"].map((s) => <option key={s} value={s}>{s === "NOT_ASSESSED" ? (L ? "TIDAK DINILAI" : "NOT ASSESSED") : t(`status.${s}`)}</option>)}</select>
  );
  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}{sp.error && <Notice kind="error">{sp.error}</Notice>}
      <PageHeader title={`${c.caseCode} — ${c.title}`} subtitle={`${L ? cat?.id : cat?.en} · ${t(`stage.${c.stage}`)}`}
        actions={<>{c.isFictionalFixture ? <Pill tone="amber">{L ? "FIKTIF — bukan validasi nyata" : "FICTIONAL — not real validation"}</Pill> : <Pill tone="navy">{L ? "KASUS NYATA" : "REAL CASE"}</Pill>}<Pill>{c.status}</Pill></>} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {/* Langkah 1 */}
          <Card><CardHeader title={L ? "Langkah 1 — Penilaian referensi manual independen" : "Step 1 — Independent manual reference assessment"} subtitle={L ? "Dicatat SEBELUM rekomendasi aplikasi dijalankan/diungkap (mengurangi anchoring). Setelah dicatat, referensi dikunci; revisi = versi baru." : "Recorded BEFORE the application recommendation is run/revealed (reduces anchoring). Once recorded it is locked; a revision is a new version."} />
            <CardBody>
              {isShell ? <Notice kind="warn">{L ? "Kasus ini masih kerangka. Lengkapi detail di bawah terlebih dahulu." : "This case is still a shell. Complete the details below first."}</Notice> : (
                <>
                  {ref && (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                      <div className="mb-1 flex flex-wrap gap-2"><Pill tone="navy">{L ? "Referensi v" : "Reference v"}{ref.version} 🔒</Pill><span className="text-xs text-slate-600">{ref.assessorName} · {fmtDate(ref.assessedAt)} · {L ? "kebijakan v" : "policy v"}{ref.policyVersion}</span></div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">{([["journal", ref.journalStatus], ["destination", ref.destinationStatus], ["admin", ref.adminStatus], ["final", ref.finalStatus]] as const).map(([d, v]) => (<div key={d}><div className="label !mb-0.5">{d}</div>{v === "NOT_ASSESSED" ? <Pill>{L ? "tidak dinilai" : "not assessed"}</Pill> : <StatusBadge status={v as any} lang={lang} />}</div>))}</div>
                      <p className="mt-2 whitespace-pre-line">{ref.rationale}</p>
                      {ref.uncertainty && <p className="mt-1 text-xs text-slate-600"><b>{L ? "Ketidakpastian" : "Uncertainty"}:</b> {ref.uncertainty}</p>}
                      <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">{parseJson<SourceRef[]>(ref.sourcesJson, []).map((s, i) => <li key={i}>{s.label} — {s.url ? <a className="underline" href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.url}</a> : s.ref} {s.sourceDataDate ? `· ${L ? "data" : "data"} ${s.sourceDataDate}` : ""} {s.retrievedAt ? `· ${L ? "diambil" : "retrieved"} ${s.retrievedAt}` : ""}</li>)}</ul>
                    </div>
                  )}
                  <details open={!ref}><summary className="cursor-pointer text-sm font-semibold text-navy-700">{ref ? (L ? "Catat revisi referensi (versi baru)" : "Record a reference revision (new version)") : (L ? "Catat referensi manual" : "Record manual reference")}</summary>
                    <form action={recordReferenceAction} className="mt-3 grid gap-3 md:grid-cols-2">
                      <input type="hidden" name="caseId" value={c.id} />
                      <label><span className="label">{t("dim.journal")}</span>{sel("journalStatus")}</label><label><span className="label">{t("dim.destination")}</span>{sel("destinationStatus")}</label>
                      <label><span className="label">{t("dim.admin")}</span>{sel("adminStatus")}</label><label><span className="label">{t("dim.final")}</span>{sel("finalStatus")}</label>
                      <label className="md:col-span-2"><span className="label">{L ? "Rasional referensi (min. 20 karakter) *" : "Reference rationale (min. 20 chars) *"}</span><textarea className="input" name="rationale" rows={3} required minLength={20} /></label>
                      <label className="md:col-span-2"><span className="label">{L ? "Ketidakpastian yang belum terselesaikan" : "Unresolved uncertainty"}</span><textarea className="input" name="uncertainty" rows={2} /></label>
                      <label><span className="label">{L ? "Tanggal penilaian manual *" : "Manual assessment date *"}</span><input className="input" type="date" name="assessedAt" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                      <div className="text-xs text-slate-600"><span className="label">{L ? "Penilai" : "Assessor"}</span>{user.name}</div>
                      <label className="md:col-span-2"><span className="label">{L ? "Sumber (≥1; satu per baris): label | URL atau referensi dokumen | tgl data sumber | tgl diambil" : "Sources (≥1; one per line): label | URL or document ref | source data date | retrieval date"}</span><textarea className="input" name="sources" rows={3} required placeholder={SRC_PLACEHOLDER} /></label>
                      <div className="md:col-span-2"><button className="btn-primary" type="submit">{L ? "Kunci referensi manual" : "Lock manual reference"}</button></div>
                    </form></details>
                </>
              )}
            </CardBody></Card>

          {/* Langkah 2 & hasil */}
          <Card><CardHeader title={L ? "Langkah 2 — Jalankan aplikasi & bandingkan" : "Step 2 — Run the application & compare"} subtitle={L ? "Rekomendasi aplikasi baru tampil setelah proses dijalankan. Tiap proses mengunci snapshot bukti, versi kebijakan, dan versi aplikasi." : "The application's recommendation appears only after a run. Each run locks the evidence snapshot, policy version and application version."} />
            <CardBody><div id="hasil" className="space-y-5">
              {!ref ? <p className="text-sm text-slate-600">{L ? "Menunggu referensi manual — rekomendasi aplikasi belum dijalankan/diungkap." : "Awaiting manual reference — the application recommendation has not been run/revealed."}</p> : (
                <form action={runCaseAction}><input type="hidden" name="caseId" value={c.id} /><button className="btn-primary" type="submit" disabled={isShell}>{c.runs.length ? (L ? "Jalankan ulang (proses baru; riwayat dipertahankan)" : "Run again (new run; history kept)") : (L ? "Jalankan aplikasi pada kasus ini" : "Run the application on this case")}</button></form>
              )}
              {c.runs.map((r) => {
                const cmp = parseJson<ComparisonSummary>(r.comparisonJson, null as any);
                const gen = parseJson<any>(r.generatedJson, {});
                const snap = parseJson<any[]>(r.evidenceSnapshotJson, []);
                const isLatest = r.id === c.runs[0].id;
                return (
                  <div key={r.id} className={`rounded-lg border p-4 ${r.agreement === "AGREE" ? "border-green-300" : r.agreement === "DISAGREE" ? "border-red-300" : "border-slate-200"}`}>
                    <div className="flex flex-wrap items-center gap-2 text-sm"><b>{L ? "Proses" : "Run"} #{r.runNo}</b><Pill tone={r.agreement === "AGREE" ? "green" : r.agreement === "DISAGREE" ? "red" : "slate"}>{r.agreement}</Pill>
                      {r.safetyCritical && <Pill tone="red">{L ? "KRITIS KESELAMATAN: aplikasi lebih longgar dari referensi" : "SAFETY-CRITICAL: application more permissive than reference"}</Pill>}
                      {r.retestOutcome && <Pill tone={r.retestOutcome === "RESOLVED" ? "green" : "amber"}>{L ? "uji ulang" : "retest"}: {r.retestOutcome}</Pill>}
                      <span className="ml-auto text-xs text-slate-500">{fmtDate(r.runAt, true)} · {r.runByName}</span></div>
                    <table className="my-2 w-full text-sm"><thead><tr><th className="th">{L ? "Dimensi" : "Dimension"}</th><th className="th">{L ? "Referensi manual" : "Manual reference"}</th><th className="th">{L ? "Aplikasi" : "Application"}</th><th className="th">{L ? "Hasil" : "Result"}</th></tr></thead>
                      <tbody>{DIMENSIONS.map((d) => { const x = cmp.dims[d]; return (<tr key={d} className="border-t border-slate-100"><td className="td">{d}</td><td className="td">{x.reference === "NOT_ASSESSED" ? "—" : <StatusBadge status={x.reference as any} lang={lang} />}</td><td className="td">{x.generated === "NOT_EVALUATED" ? (L ? "tidak dievaluasi" : "not evaluated") : <StatusBadge status={x.generated as any} lang={lang} />}</td>
                        <td className="td text-xs">{x.result}{x.direction === "APP_MORE_PERMISSIVE" ? ` — ${L ? "lebih longgar" : "more permissive"}` : x.direction === "APP_MORE_CONSERVATIVE" ? ` — ${L ? "lebih ketat" : "more conservative"}` : ""}</td></tr>); })}</tbody></table>
                    <p className="text-[11px] text-slate-500">{L ? "Snapshot" : "Snapshot"}: {L ? "kebijakan" : "policy"} v{r.policyVersion} ({r.policyHash}) · {r.appVersion} · {snap.length} {L ? "catatan bukti" : "evidence records"} · {L ? "referensi v" : "reference v"}{r.reference.version}{c.authenticUrl ? ` · ${L ? "URL otentik dikenal sistem" : "authentic URL known to system"}: ${gen.authenticUrlKnownToSystem == null ? "?" : gen.authenticUrlKnownToSystem ? (L ? "ya" : "yes") : (L ? "tidak" : "no")}` : ""}{r.assessmentId && <> · <Link className="underline" href={`/investigations/${r.assessmentId}`}>{L ? "buka penilaian" : "open assessment"}</Link></>}</p>
                    {r.discrepancyClass && <p className="mt-2 text-sm"><b>{r.discrepancyClass}</b>: {r.discrepancyNote}{r.correctiveAction ? ` — ${L ? "tindakan korektif" : "corrective action"}: ${r.correctiveAction}` : ""}</p>}
                    {r.agreement === "DISAGREE" && !r.discrepancyClass && (
                      <form action={classifyRunAction} className="mt-3 grid gap-2 md:grid-cols-2"><input type="hidden" name="caseId" value={c.id} /><input type="hidden" name="runId" value={r.id} />
                        <label><span className="label">{L ? "Klasifikasi perbedaan *" : "Discrepancy classification *"}</span><select className="input" name="discrepancyClass">{DISCREPANCY_CLASSES.map((d) => <option key={d.code} value={d.code}>{L ? d.id : d.en}</option>)}</select></label>
                        <label><span className="label">{L ? "Tindakan korektif" : "Corrective action"}</span><input className="input" name="correctiveAction" /></label>
                        <label className="md:col-span-2"><span className="label">{L ? "Catatan (min. 10 karakter) *" : "Note (min. 10 chars) *"}</span><input className="input" name="note" required minLength={10} /></label>
                        <div className="md:col-span-2"><button className="btn-outline" type="submit">{L ? "Simpan klasifikasi" : "Save classification"}</button></div></form>
                    )}
                    {isLatest && r.discrepancyClass && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <form action={runCaseAction}><input type="hidden" name="caseId" value={c.id} /><input type="hidden" name="retestOf" value={r.id} /><button className="btn-outline" type="submit">{L ? "Uji ulang setelah perbaikan" : "Retest after correction"}</button></form>
                        <form action={resolveCaseAction}><input type="hidden" name="caseId" value={c.id} /><button className="btn-outline" type="submit">{L ? "Tandai selesai" : "Mark resolved"}</button></form>
                      </div>
                    )}
                  </div>
                );
              })}
            </div></CardBody></Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card><CardHeader title={L ? "Detail kasus" : "Case details"} subtitle={ref ? (L ? "Dikunci setelah referensi dicatat." : "Locked once a reference is recorded.") : undefined} />
            <CardBody>
              {ref ? (
                <dl className="space-y-1.5 text-sm">
                  <div><span className="label">ISSN / E-ISSN</span>{c.issn ?? "—"} / {c.eissn ?? "—"}</div><div><span className="label">{L ? "URL diajukan" : "Submitted URL"}</span><span className="break-all font-mono text-xs">{c.submittedUrl ?? "—"}</span></div>
                  <div><span className="label">{L ? "URL otentik (independen)" : "Authentic URL (independent)"}</span><span className="break-all font-mono text-xs">{c.authenticUrl ?? "—"}</span></div><div><span className="label">{L ? "Pseudonim" : "Pseudonym"}</span>{c.pseudonym ?? "—"}</div>
                  <div><span className="label">{L ? "Sumber kasus" : "Case sources"}</span><ul className="list-disc pl-4 text-xs">{sources.map((s, i) => <li key={i}>{s.label} — {s.url || s.ref}</li>)}{sources.length === 0 && <li>—</li>}</ul></div>
                  {c.notes && <div><span className="label">{L ? "Catatan" : "Notes"}</span>{c.notes}</div>}
                </dl>
              ) : (
                <form action={updateCaseAction} className="grid gap-2">
                  <input type="hidden" name="caseId" value={c.id} />
                  <select className="input" name="category" defaultValue={c.category} aria-label="category">{VALIDATION_CATEGORIES.map((x) => <option key={x.code} value={x.code}>{L ? x.id : x.en}</option>)}</select>
                  <input className="input" name="title" defaultValue={isShell ? "" : c.title} placeholder={L ? "Judul jurnal" : "Journal title"} required aria-label="title" />
                  <div className="grid grid-cols-2 gap-2"><input className="input" name="issn" defaultValue={c.issn ?? ""} placeholder="ISSN" aria-label="issn" /><input className="input" name="eissn" defaultValue={c.eissn ?? ""} placeholder="E-ISSN" aria-label="eissn" /></div>
                  <input className="input" name="submittedUrl" defaultValue={c.submittedUrl ?? ""} placeholder={L ? "URL yang diajukan" : "Submitted URL"} aria-label="submitted" />
                  <input className="input" name="authenticUrl" defaultValue={c.authenticUrl ?? ""} placeholder={L ? "URL otentik terverifikasi independen" : "Independently verified authentic URL"} aria-label="authentic" />
                  <select className="input" name="stage" defaultValue={c.stage} aria-label="stage">{STAGES.map((s) => <option key={s} value={s}>{t(`stage.${s}`)}</option>)}</select>
                  <input className="input" name="pseudonym" defaultValue={c.pseudonym ?? ""} placeholder={L ? "Pseudonim mahasiswa" : "Student pseudonym"} aria-label="pseudonym" />
                  <input className="input" name="applicationId" defaultValue={c.applicationId ?? ""} placeholder={L ? "ID permohonan (opsional)" : "Application ID (optional)"} aria-label="application" />
                  <textarea className="input" name="sources" rows={3} defaultValue={sources.map((s) => `${s.label} | ${s.url || s.ref} | ${s.sourceDataDate ?? ""} | ${s.retrievedAt ?? ""}`).join("\n")} placeholder={SRC_PLACEHOLDER} aria-label="sources" />
                  <textarea className="input" name="notes" rows={2} defaultValue={c.notes ?? ""} placeholder={L ? "Catatan" : "Notes"} aria-label="notes" />
                  <button className="btn-outline" type="submit">{L ? "Simpan detail" : "Save details"}</button>
                </form>
              )}
            </CardBody></Card>
          {c.references.length > 1 && <Card><CardHeader title={L ? "Riwayat versi referensi" : "Reference version history"} /><CardBody><ul className="space-y-1 text-xs">{c.references.map((r) => <li key={r.id}>v{r.version} · {r.assessorName} · {fmtDate(r.assessedAt)} · {r.journalStatus}/{r.destinationStatus}/{r.adminStatus}/{r.finalStatus}</li>)}</ul></CardBody></Card>}
        </div>
      </div>
    </>
  );
}
