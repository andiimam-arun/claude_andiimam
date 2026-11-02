import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { PageHeader, Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";
import { getActivePolicy } from "@/lib/services/policyService";

export const dynamic = "force-dynamic";

export default async function EvidenceReview() {
  await requireRole("REVIEWER", "HEAD");
  const [{ lang, t }, policy] = await Promise.all([getT(), getActivePolicy()]);
  const L = lang === "id";
  const [docs, flags, checklist] = await Promise.all([
    prisma.document.findMany({ where: { fieldsReviewed: false }, include: { application: true }, orderBy: { createdAt: "asc" } }),
    prisma.consistencyFlag.findMany({ where: { state: "OPEN" }, include: { application: true }, orderBy: { createdAt: "asc" } }),
    prisma.checklistItem.findMany({ where: { status: "UNVERIFIED", application: { workflow: { notIn: ["APPROVED", "REJECTED"] } } }, include: { application: true } }),
  ]);
  const deadline = (d: Date) => { const due = new Date(d.getTime() + policy.config.evidenceReviewDeadlineDays * 86_400_000); return { due, late: due.getTime() < Date.now() }; };
  return (
    <>
      <PageHeader title={t("nav.evidence")} subtitle={L ? `Antrean tinjauan manusia. Tenggat tinjauan menurut kebijakan: ${policy.config.evidenceReviewDeadlineDays} hari.` : `Human review queue. Policy review deadline: ${policy.config.evidenceReviewDeadlineDays} days.`} />
      <div className="space-y-6">
        <Card><CardHeader title={L ? `Ekstraksi dokumen belum ditinjau (${docs.length})` : `Unreviewed document extractions (${docs.length})`} />
          <ul className="divide-y divide-slate-100">{docs.map((d) => { const dl = deadline(d.createdAt); return (<li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"><Link className="font-semibold text-navy-800 underline" href={`/applications/${d.applicationId}#dokumen`}>{d.application.refNumber}</Link><span>{d.filename}</span><Pill tone="navy">{t(`doc.${d.docType}`)}</Pill><span className={`ml-auto text-xs ${dl.late ? "font-bold text-bad" : "text-slate-500"}`}>{L ? "tenggat" : "due"} {fmtDate(dl.due)}{dl.late ? ` (${L ? "terlambat" : "overdue"})` : ""}</span></li>); })}
            {docs.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">—</li>}</ul></Card>
        <Card><CardHeader title={L ? `Tanda peninjauan terbuka (${flags.length})` : `Open review flags (${flags.length})`} />
          <ul className="divide-y divide-slate-100">{flags.map((f) => (<li key={f.id} className="px-5 py-3 text-sm"><Link className="font-semibold text-navy-800 underline" href={`/applications/${f.applicationId}#tanda`}>{f.application.refNumber}</Link> <Pill tone={f.severity === "HIGH" ? "red" : f.severity === "MEDIUM" ? "amber" : "slate"}>{t(`sev.${f.severity}`)}</Pill> {f.message}</li>))}
            {flags.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">—</li>}</ul></Card>
        <Card><CardHeader title={L ? `Item daftar periksa belum diverifikasi (${checklist.length})` : `Unverified checklist items (${checklist.length})`} />
          <ul className="divide-y divide-slate-100">{checklist.map((c) => (<li key={c.id} className="px-5 py-3 text-sm"><Link className="font-semibold text-navy-800 underline" href={`/applications/${c.applicationId}#daftar-bukti`}>{c.application.refNumber}</Link> {t(`doc.${c.docType}`)}</li>))}
            {checklist.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">—</li>}</ul></Card>
      </div>
    </>
  );
}
