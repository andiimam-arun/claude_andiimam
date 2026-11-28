import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";
import { normalizeTitle } from "@/lib/engine/util";
import { normalizeIssn } from "@/lib/engine/issn";

export const dynamic = "force-dynamic";

export default async function Journals({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireRole("REVIEWER", "HEAD", "ADMIN");
  const [{ lang, t }, sp] = await Promise.all([getT(), searchParams]);
  const q = (sp.q ?? "").trim();
  const issn = normalizeIssn(q);
  const js = await prisma.journal.findMany({
    where: q ? { OR: [{ normTitle: { contains: normalizeTitle(q) } }, ...(issn ? [{ issn }, { eissn: issn }] : []), { scopusSourceId: q }, { publisher: { contains: q } }] } : undefined,
    include: { assessments: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { applications: true } } }, orderBy: { updatedAt: "desc" }, take: 200,
  });
  const rows = sp.status ? js.filter((j) => j.assessments[0]?.journalStatus === sp.status) : js;
  const L = lang === "id";
  return (
    <>
      <PageHeader title={t("nav.journals")} subtitle={L ? "Journal Passport: paspor institusi setiap jurnal yang pernah dinilai (identitas, domain terverifikasi, riwayat, sinyal peringatan, jadwal validasi ulang). Status lama bukan jaminan; lihat tanggal verifikasi terakhir." : "Journal Passport: the institutional passport of every assessed journal (identity, verified domains, history, warning signals, revalidation date). An old status is no guarantee; see the last verification date."}
        actions={<a className="btn-outline" href="/api/export/journals">{L ? "Ekspor CSV" : "Export CSV"}</a>} />
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input className="input max-w-md" name="q" defaultValue={q} placeholder={L ? "Cari ISSN, Source ID, judul, penerbit…" : "Search ISSN, Source ID, title, publisher…"} aria-label="search" />
        <select className="input w-auto" name="status" defaultValue={sp.status ?? ""} aria-label="status"><option value="">{L ? "Semua status" : "All statuses"}</option><option value="GREEN">{t("status.GREEN")}</option><option value="YELLOW">{t("status.YELLOW")}</option><option value="RED">{t("status.RED")}</option></select>
        <button className="btn-primary" type="submit">{L ? "Cari" : "Search"}</button>
      </form>
      <Card><div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className="th">{L ? "Jurnal" : "Journal"}</th><th className="th">ISSN</th><th className="th">{L ? "Penerbit" : "Publisher"}</th><th className="th">{L ? "Status terakhir" : "Latest status"}</th><th className="th">{L ? "Verifikasi terakhir" : "Last verified"}</th><th className="th">{L ? "Validasi ulang" : "Revalidate by"}</th><th className="th">{L ? "Permohonan" : "Apps"}</th><th className="th">v</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((j) => {
            const a = j.assessments[0];
            const stale = j.lastVerifiedAt ? Date.now() - j.lastVerifiedAt.getTime() > 365 * 86_400_000 : true;
            return (
              <tr key={j.id} className="hover:bg-slate-50">
                <td className="td"><Link className="font-semibold text-navy-800 underline" href={`/journals/${j.id}`}>{j.title}</Link>{j.isDemo && <Pill tone="amber" className="ml-2">{L ? "FIKTIF" : "FICTIONAL"}</Pill>}{j.reassessFlag && <Pill tone="navy" className="ml-1">{L ? "ditandai" : "flagged"}</Pill>}</td>
                <td className="td font-mono text-xs">{j.issn ?? "—"}<br />{j.eissn ?? ""}</td>
                <td className="td">{j.publisher ?? "—"}</td>
                <td className="td">{a ? <StatusBadge status={a.journalStatus as any} lang={lang} /> : "—"}</td>
                <td className="td text-xs">{fmtDate(j.lastVerifiedAt)}{stale && <div className="font-semibold text-warn">{L ? "perlu validasi ulang" : "needs revalidation"}</div>}</td>
                <td className="td text-xs">{fmtDate(j.reassessDueAt)}{j.reassessDueAt && j.reassessDueAt.getTime() < Date.now() && <div className="font-semibold text-bad">{L ? "terlambat" : "overdue"}</div>}</td><td className="td">{j._count.applications}</td><td className="td text-xs text-slate-500">{j.recordVersion}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>{L ? "Belum ada jurnal." : "No journals."}</td></tr>}
        </tbody></table></div></Card>
    </>
  );
}
