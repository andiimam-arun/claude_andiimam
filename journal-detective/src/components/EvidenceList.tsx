import { reviewEvidenceAction, retractEvidenceAction } from "@/app/actions/investigations";
import type { EvidenceRecord } from "@/lib/engine/types";
import { t, type Lang } from "@/lib/i18n";
import { fmtDate } from "@/lib/utils";
import { Pill } from "./StatusBadge";

const ST_TONE: Record<string, "green" | "amber" | "red" | "slate" | "navy"> = { VERIFIED: "green", REPORTED_UNVERIFIED: "amber", NOT_FOUND: "slate", UNAVAILABLE: "slate", CONFLICTED: "red" };
const SEV_TONE: Record<string, "green" | "amber" | "red" | "slate" | "navy"> = { INFO: "slate", LOW: "navy", MEDIUM: "amber", HIGH: "red", CRITICAL: "red" };
const ORDER = ["IDENTITY", "SCOPUS", "SCIMAGO", "PREDATORY", "HIJACK", "METADATA", "NATIONAL"];

export function EvidenceList({ evidence, journalId, back, lang, canReview }: { evidence: EvidenceRecord[]; journalId: string; back: string; lang: Lang; canReview: boolean }) {
  const groups = ORDER.map((c) => ({ c, items: evidence.filter((e) => e.check === c) })).filter((g) => g.items.length);
  const id = lang === "id";
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.c} aria-labelledby={`chk-${g.c}`}>
          <h3 id={`chk-${g.c}`} className="mb-2 text-sm font-bold text-navy-900">{t(lang, `check.${g.c}`)}</h3>
          <ul className="space-y-2.5">
            {g.items.map((e) => (
              <li key={e.fingerprint + (e.id ?? "")} className="rounded-lg border border-slate-200 bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={ST_TONE[e.status]}>{t(lang, `ev.status.${e.status}`)}</Pill>
                  <Pill tone="navy">{t(lang, `integ.${e.integration}`)}</Pill>
                  <Pill tone={SEV_TONE[e.severity]}>{id ? "Keparahan" : "Severity"}: {t(lang, `sev.${e.severity}`)}</Pill>
                  <Pill>{id ? "Kekuatan bukti" : "Evidence strength"}: {t(lang, `strength.${e.strength}`)}</Pill>
                  {e.requiresHumanConfirmation && <Pill tone={e.review === "PENDING" ? "amber" : "slate"}>{t(lang, `review.${e.review}`)}</Pill>}
                  <code className="ml-auto text-[11px] text-slate-400">{e.key}</code>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-900">{e.finding}</p>
                {e.extracted && <p className="mt-1 break-words rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600">{e.extracted.slice(0, 500)}</p>}
                {e.explanation && <p className="mt-1.5 text-xs text-slate-600">{e.explanation}</p>}
                <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-[11px] text-slate-500 sm:grid-cols-2">
                  <div><dt className="inline font-semibold">{id ? "Sumber" : "Source"}: </dt><dd className="inline">{e.sourceName}</dd></div>
                  <div><dt className="inline font-semibold">URL/{id ? "Ref." : "Ref."}: </dt><dd className="inline break-all">{e.sourceUrl ? <a className="text-navy-700 underline" href={e.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{e.sourceUrl}</a> : e.sourceRef ?? "—"}</dd></div>
                  <div><dt className="inline font-semibold">{id ? "Diambil" : "Retrieved"}: </dt><dd className="inline">{fmtDate(e.retrievedAt)}</dd></div>
                  <div><dt className="inline font-semibold">{id ? "Tanggal data sumber" : "Source data date"}: </dt><dd className="inline">{e.sourceDataDate ? fmtDate(e.sourceDataDate) : id ? "tidak diketahui" : "unknown"}</dd></div>
                </dl>
                {canReview && e.requiresHumanConfirmation && e.review === "PENDING" && (
                  <form action={reviewEvidenceAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                    <input type="hidden" name="journalId" value={journalId} /><input type="hidden" name="fingerprint" value={e.fingerprint} /><input type="hidden" name="back" value={back} />
                    <label className="min-w-[220px] flex-1"><span className="label">{id ? "Catatan peninjauan (min. 10 karakter)" : "Review note (min. 10 chars)"}</span><input className="input" name="note" required minLength={10} /></label>
                    <button name="decision" value="CONFIRMED" className="btn-danger" type="submit">{id ? "Konfirmasi kekhawatiran" : "Confirm concern"}</button>
                    <button name="decision" value="DISMISSED" className="btn-outline" type="submit">{id ? "Tolak (tidak terbukti)" : "Dismiss (unfounded)"}</button>
                  </form>
                )}
                {canReview && e.origin === "MANUAL" && e.id && (
                  <form action={retractEvidenceAction} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="reason" value="ditarik oleh peninjau" />
                    <button className="text-xs font-medium text-bad underline" type="submit">{id ? "Tarik bukti manual ini" : "Retract this manual evidence"}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
