import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/engine/util";
import { normalizeIssn } from "@/lib/engine/issn";
import { normalizeTitle } from "@/lib/engine/util";
import type { JournalDecision } from "@/lib/engine/types";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AssessmentHistory({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; dest?: string; from?: string; to?: string; by?: string }> }) {
  await requireRole("REVIEWER", "HEAD", "ADMIN");
  const [{ lang, t }, sp] = await Promise.all([getT(), searchParams]);
  const L = lang === "id";
  const q = (sp.q ?? "").trim();
  const issn = normalizeIssn(q);
  const to = sp.to ? new Date(new Date(sp.to).getTime() + 86_400_000) : undefined;
  const rows = await prisma.assessment.findMany({
    where: {
      ...(sp.status ? { journalStatus: sp.status } : {}),
      ...(sp.from || to ? { createdAt: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(to ? { lt: to } : {}) } } : {}),
      ...(sp.by ? { createdById: sp.by } : {}),
      ...(q ? { OR: [{ refNumber: { contains: q } }, { submittedDomain: { contains: q.toLowerCase() } }, { journal: { OR: [{ normTitle: { contains: normalizeTitle(q) } }, ...(issn ? [{ issn }, { eissn: issn }] : []), { publisher: { contains: q } }] } }] } : {}),
    },
    include: { journal: true }, orderBy: { createdAt: "desc" }, take: 300,
  });
  const filtered = sp.dest ? rows.filter((a) => parseJson<JournalDecision | null>(a.decisionJson, null)?.destinationStatus === sp.dest) : rows;
  const users = await prisma.user.findMany({ where: { role: { not: "STUDENT" } } });
  const nameOf = new Map((await prisma.user.findMany()).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title={t("nav.assessments")} subtitle={L ? "Seluruh penilaian jurnal yang tersimpan (tidak pernah ditimpa). Cari menurut jurnal, ISSN, domain, nomor penilaian, status, tanggal, atau penilai." : "Every stored journal assessment (never overwritten). Search by journal, ISSN, domain, reference, status, date or assessor."} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder={L ? "Jurnal, ISSN, domain, nomor…" : "Journal, ISSN, domain, ref…"} aria-label="search" />
        <select className="input w-auto" name="status" defaultValue={sp.status ?? ""} aria-label="status"><option value="">{L ? "Semua status" : "All statuses"}</option>{["GREEN", "YELLOW", "RED"].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select>
        <select className="input w-auto" name="dest" defaultValue={sp.dest ?? ""} aria-label="destination"><option value="">{L ? "Semua tujuan" : "All destinations"}</option>{["GREEN", "YELLOW", "RED"].map((s) => <option key={s} value={s}>{L ? "Tujuan " : "Destination "}{t(`status.${s}`)}</option>)}</select>
        <label className="text-xs">{L ? "Dari" : "From"}<input className="input" type="date" name="from" defaultValue={sp.from ?? ""} /></label>
        <label className="text-xs">{L ? "Sampai" : "To"}<input className="input" type="date" name="to" defaultValue={sp.to ?? ""} /></label>
        <select className="input w-auto" name="by" defaultValue={sp.by ?? ""} aria-label="assessor"><option value="">{L ? "Semua penilai" : "All assessors"}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <button className="btn-primary" type="submit">{L ? "Cari" : "Search"}</button>
      </form>
      <Card><div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className="th">Ref.</th><th className="th">{L ? "Tanggal" : "Date"}</th><th className="th">{L ? "Jurnal" : "Journal"}</th><th className="th">{L ? "Situs diajukan" : "Submitted site"}</th><th className="th">{L ? "Status jurnal" : "Journal status"}</th><th className="th">{L ? "Status tujuan" : "Destination status"}</th><th className="th">Scopus</th><th className="th">{L ? "Penilai" : "Assessor"}</th><th className="th">{L ? "Kebijakan" : "Policy"}</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{filtered.map((a) => { const d = parseJson<JournalDecision | null>(a.decisionJson, null); return (
          <tr key={a.id} className="hover:bg-slate-50"><td className="td"><Link className="font-semibold text-navy-800 underline" href={`/investigations/${a.id}`}>{a.refNumber}</Link></td><td className="td text-xs">{fmtDate(a.createdAt, true)}</td>
            <td className="td"><Link className="underline" href={`/journals/${a.journalId}`}>{a.journal.title}</Link><div className="font-mono text-[11px] text-slate-500">{a.journal.issn ?? ""}</div></td><td className="td font-mono text-xs">{a.submittedDomain ?? "—"}</td>
            <td className="td"><StatusBadge status={a.journalStatus as any} lang={lang} /></td>
            <td className="td">{d ? <><StatusBadge status={d.destinationStatus} lang={lang} />{d.identityFraudBlock && <div className="mt-1 text-[11px] font-bold text-bad-ink">{L ? "klon/identitas palsu" : "clone/identity fraud"}</div>}</> : "—"}</td>
            <td className="td text-xs">{d ? t(`idx.${d.indexingStatus}`) : "—"}{d?.indexingBasis ? ` · ${t(`integ.${d.indexingBasis}`)}` : ""}</td><td className="td text-xs">{nameOf.get(a.createdById) ?? "—"}</td><td className="td text-xs">v{a.policyVersion}</td></tr>); })}
          {filtered.length === 0 && <tr><td className="td text-slate-500" colSpan={9}>—</td></tr>}</tbody></table></div></Card>
    </>
  );
}
