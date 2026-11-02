import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { evaluateApplication } from "@/lib/services/applications";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Applications({ searchParams }: { searchParams: Promise<{ workflow?: string; q?: string }> }) {
  const user = await requireUser();
  const [{ lang, t }, sp] = await Promise.all([getT(), searchParams]);
  const apps = await prisma.application.findMany({
    where: { ...(user.role === "STUDENT" ? { studentUserId: user.id } : {}), ...(sp.workflow ? { workflow: sp.workflow } : {}), ...(sp.q ? { OR: [{ studentName: { contains: sp.q } }, { manuscriptTitle: { contains: sp.q } }, { journalName: { contains: sp.q } }, { refNumber: { contains: sp.q } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 200,
  });
  const evals = await Promise.all(apps.map((a) => evaluateApplication(a)));
  const L = lang === "id";
  return (
    <>
      <PageHeader title={t("nav.applications")} actions={<Link className="btn-primary" href="/applications/new">{L ? "Permohonan baru" : "New application"}</Link>} />
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input className="input max-w-sm" name="q" defaultValue={sp.q ?? ""} placeholder={L ? "Cari nama, judul, jurnal, no. permohonan…" : "Search name, title, journal, ref…"} aria-label="search" />
        <select className="input w-auto" name="workflow" defaultValue={sp.workflow ?? ""} aria-label="workflow"><option value="">{L ? "Semua alur" : "All workflow states"}</option>
          {["PENDING_REVIEW", "IN_REVIEW", "NEEDS_EVIDENCE", "RETURNED", "ESCALATED", "RECOMMENDED", "APPROVED", "REJECTED"].map((w) => <option key={w} value={w}>{t(`wf.${w}`)}</option>)}</select>
        <button className="btn-primary" type="submit">{L ? "Saring" : "Filter"}</button>
      </form>
      <Card><div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className="th">Ref.</th><th className="th">{L ? "Mahasiswa" : "Student"}</th><th className="th">{L ? "Naskah / Jurnal" : "Manuscript / Journal"}</th><th className="th">{L ? "Tahap" : "Stage"}</th>
          <th className="th">{L ? "Jurnal" : "Journal"}</th><th className="th">{L ? "Tujuan" : "Destination"}</th><th className="th">{L ? "Administratif" : "Admin"}</th><th className="th">{L ? "Akhir" : "Final"}</th><th className="th">{L ? "Alur" : "Workflow"}</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {apps.map((a, i) => { const e = evals[i]; return (
            <tr key={a.id} className="hover:bg-slate-50">
              <td className="td"><Link className="font-semibold text-navy-800 underline" href={`/applications/${a.id}`}>{a.refNumber}</Link><div className="text-xs text-slate-500">{fmtDate(a.createdAt)}</div></td>
              <td className="td">{a.studentName}<div className="text-xs text-slate-500">{a.studentNumber}</div></td>
              <td className="td max-w-xs"><div className="line-clamp-2 font-medium">{a.manuscriptTitle}</div><div className="text-xs text-slate-500">{a.journalName}</div></td>
              <td className="td text-xs">{t(`stage.${a.stage}`)}</td>
              <td className="td">{e.journal ? <StatusBadge status={e.journal.journalStatus} lang={lang} /> : "—"}</td>
              <td className="td">{e.journal ? <StatusBadge status={e.journal.destinationStatus} lang={lang} /> : <span className="text-xs text-warn">{L ? "nilai ulang" : "reassess"}</span>}</td>
              <td className="td"><StatusBadge status={e.administrative.status} lang={lang} /></td>
              <td className="td">{e.final ? <StatusBadge status={e.final.status} lang={lang} /> : "—"}</td>
              <td className="td text-xs">{t(`wf.${a.workflow}`)}</td>
            </tr>); })}
          {apps.length === 0 && <tr><td className="td text-slate-500" colSpan={9}>—</td></tr>}
        </tbody></table></div></Card>
    </>
  );
}
