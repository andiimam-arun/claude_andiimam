import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { evaluateApplication } from "@/lib/services/applications";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Approvals() {
  const user = await requireRole("REVIEWER", "HEAD");
  const { lang, t } = await getT();
  const L = lang === "id";
  const apps = await prisma.application.findMany({ where: { workflow: { in: ["RECOMMENDED", "ESCALATED", "IN_REVIEW", "PENDING_REVIEW"] } }, orderBy: { createdAt: "asc" } });
  const rank: Record<string, number> = { RECOMMENDED: 0, ESCALATED: 1, IN_REVIEW: 2, PENDING_REVIEW: 3 };
  apps.sort((a, b) => rank[a.workflow] - rank[b.workflow]);
  const evals = await Promise.all(apps.map((a) => evaluateApplication(a)));
  return (
    <>
      <PageHeader title={t("nav.approvals")} subtitle={user.role === "HEAD" ? (L ? "Hanya Anda yang dapat memberi persetujuan institusional. Rekomendasi sistem bersifat penasihat." : "Only you can grant institutional approval. System recommendations are advisory.") : (L ? "Antrean untuk ditinjau; persetujuan akhir oleh Kepala Unit." : "Queue for review; final approval by the Head.")} />
      <Card><div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className="th">Ref.</th><th className="th">{L ? "Naskah" : "Manuscript"}</th><th className="th">{L ? "Jurnal / Tujuan" : "Journal / Destination"}</th><th className="th">{L ? "Rekomendasi akhir" : "Final recommendation"}</th><th className="th">{L ? "Rekomendasi peninjau" : "Reviewer recommendation"}</th><th className="th">{L ? "Alur" : "Workflow"}</th><th className="th">{L ? "Diajukan" : "Submitted"}</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{apps.map((a, i) => { const e = evals[i]; return (
          <tr key={a.id} className="hover:bg-slate-50"><td className="td"><Link className="font-semibold text-navy-800 underline" href={`/applications/${a.id}`}>{a.refNumber}</Link></td>
            <td className="td max-w-xs"><div className="line-clamp-2">{a.manuscriptTitle}</div><div className="text-xs text-slate-500">{a.studentName} · {a.journalName}</div></td>
            <td className="td">{e.journal ? <div className="flex flex-col gap-1"><StatusBadge status={e.journal.journalStatus} lang={lang} /><StatusBadge status={e.journal.destinationStatus} lang={lang} /></div> : "—"}</td><td className="td">{e.final ? <StatusBadge status={e.final.status} lang={lang} /> : <span className="text-xs text-warn">{L ? "perlu penilaian ulang" : "reassessment needed"}</span>}{e.final?.hardBlock && <div className="mt-1 text-xs font-bold text-bad-ink">{L ? "diblokir permanen" : "hard-blocked"}</div>}</td>
            <td className="td">{a.recommendation ? <Pill tone={a.recommendation === "RECOMMEND_APPROVE" ? "green" : "red"}>{t(`act.${a.recommendation}`)}</Pill> : "—"}</td>
            <td className="td text-xs">{t(`wf.${a.workflow}`)}</td><td className="td text-xs">{fmtDate(a.createdAt)}</td></tr>); })}
          {apps.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>—</td></tr>}</tbody></table></div></Card>
    </>
  );
}
