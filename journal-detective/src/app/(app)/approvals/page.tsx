import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { evaluateApplication } from "@/lib/services/applications";
import { PageHeader, Card, Notice } from "@/components/ui/card";
import { batchApproveAction } from "@/app/actions/admin";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Approvals({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await requireRole("REVIEWER", "HEAD");
  const { lang, t } = await getT();
  const L = lang === "id";
  const apps = await prisma.application.findMany({ where: { workflow: { in: ["RECOMMENDED", "ESCALATED", "IN_REVIEW", "PENDING_REVIEW"] } }, orderBy: { createdAt: "asc" } });
  const rank: Record<string, number> = { RECOMMENDED: 0, ESCALATED: 1, IN_REVIEW: 2, PENDING_REVIEW: 3 };
  apps.sort((a, b) => rank[a.workflow] - rank[b.workflow]);
  const evals = await Promise.all(apps.map((a) => evaluateApplication(a)));
  // "Bersih" = jurnal, tujuan, administratif, dan akhir semuanya HIJAU, tanpa blokir, penilaian masih berlaku, dan belum dieskalasi.
  const isClean = (i: number) => {
    const e = evals[i], f = e.final;
    return !!f && !e.invalidated && f.status === "GREEN" && f.journalStatus === "GREEN" && f.destinationStatus === "GREEN" && f.administrativeStatus === "GREEN" && !f.hardBlock && !f.clearanceBlocked && ["PENDING_REVIEW", "IN_REVIEW", "RECOMMENDED"].includes(apps[i].workflow);
  };
  const idx = apps.map((_, i) => i);
  const attention = idx.filter((i) => !isClean(i));
  const clean = idx.filter(isClean);
  const why = (i: number) => {
    const e = evals[i], a = apps[i];
    if (!e.final) return L ? "penilaian jurnal perlu diperbarui" : "journal assessment needs refresh";
    if (e.final.hardBlock) return L ? "diblokir permanen" : "hard-blocked";
    if (a.workflow === "ESCALATED") return L ? "dieskalasi" : "escalated";
    const parts = [["jurnal", "journal", e.final.journalStatus], ["tujuan", "destination", e.final.destinationStatus], ["administratif", "administrative", e.final.administrativeStatus]].filter((p) => p[2] !== "GREEN").map((p) => `${L ? p[0] : p[1]}: ${p[2]}`);
    return parts.join(", ") || (L ? "perlu tinjauan" : "needs review");
  };
  const Row = ({ i, sel }: { i: number; sel?: boolean }) => { const a = apps[i], e = evals[i]; return (
    <tr key={a.id} className="hover:bg-slate-50">{sel !== undefined && <td className="td w-8"><input type="checkbox" name="id" value={a.id} defaultChecked={sel} aria-label={a.refNumber} /></td>}
      <td className="td"><Link className="font-semibold text-navy-800 underline" href={`/applications/${a.id}`}>{a.refNumber}</Link></td>
      <td className="td max-w-xs"><div className="line-clamp-2">{a.manuscriptTitle}</div><div className="text-xs text-slate-500">{a.studentName} · {a.journalName}</div></td>
      <td className="td">{e.journal ? <div className="flex flex-col gap-1"><StatusBadge status={e.journal.journalStatus} lang={lang} /><StatusBadge status={e.journal.destinationStatus} lang={lang} /></div> : "—"}</td>
      <td className="td">{e.final ? <StatusBadge status={e.final.status} lang={lang} /> : <span className="text-xs text-warn">{L ? "perlu penilaian ulang" : "reassessment needed"}</span>}{sel === undefined && <div className="mt-1 text-xs text-slate-600">{why(i)}</div>}</td>
      <td className="td">{a.recommendation ? <Pill tone={a.recommendation === "RECOMMEND_APPROVE" ? "green" : "red"}>{t(`act.${a.recommendation}`)}</Pill> : "—"}</td>
      <td className="td text-xs">{t(`wf.${a.workflow}`)}</td><td className="td text-xs">{fmtDate(a.createdAt)}</td></tr>); };
  const head = (sel: boolean) => <thead><tr>{sel && <th className="th" />}<th className="th">Ref.</th><th className="th">{L ? "Naskah" : "Manuscript"}</th><th className="th">{L ? "Jurnal / Tujuan" : "Journal / Destination"}</th><th className="th">{L ? "Rekomendasi akhir" : "Final recommendation"}</th><th className="th">{L ? "Rekomendasi peninjau" : "Reviewer recommendation"}</th><th className="th">{L ? "Alur" : "Workflow"}</th><th className="th">{L ? "Diajukan" : "Submitted"}</th></tr></thead>;
  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}{sp.error && <Notice kind="error">{sp.error}</Notice>}
      <PageHeader title={t("nav.approvals")} subtitle={user.role === "HEAD" ? (L ? "Hanya Anda yang dapat memberi persetujuan institusional. Kasus bersih dapat disetujui sekaligus; kasus yang perlu perhatian ditinjau satu per satu." : "Only you can grant institutional approval. Clean cases can be approved in one action; cases needing attention are reviewed individually.") : (L ? "Antrean untuk ditinjau; persetujuan akhir oleh Kepala Unit." : "Queue for review; final approval by the Head.")} />
      <Card className="mb-6"><div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">{L ? `Perlu perhatian (${attention.length})` : `Needs attention (${attention.length})`}</div>
        <div className="overflow-x-auto"><table className="w-full">{head(false)}<tbody className="divide-y divide-slate-100">{attention.map((i) => <Row key={apps[i].id} i={i} />)}{attention.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>—</td></tr>}</tbody></table></div></Card>
      <Card><div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">{L ? `Bersih — semua penilaian HIJAU (${clean.length})` : `Clean — all assessments GREEN (${clean.length})`}</div>
        <form action={user.role === "HEAD" ? batchApproveAction : undefined}>
          <div className="overflow-x-auto"><table className="w-full">{head(true)}<tbody className="divide-y divide-slate-100">{clean.map((i) => <Row key={apps[i].id} i={i} sel={user.role === "HEAD"} />)}{clean.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>—</td></tr>}</tbody></table></div>
          {user.role === "HEAD" && clean.length > 0 && <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3"><button className="btn-primary" type="submit">{L ? "Setujui yang dicentang" : "Approve selected"}</button>
            <span className="text-xs text-slate-500">{L ? "Tiap permohonan dinilai ulang saat disetujui; yang tidak lagi sepenuhnya HIJAU dilewati. Setiap persetujuan tercatat atas nama Anda." : "Each application is reassessed on approval; any no longer fully GREEN is skipped. Every approval is recorded under your name."}</span></div>}
        </form></Card>
    </>
  );
}
