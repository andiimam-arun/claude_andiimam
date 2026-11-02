import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { dashboardStats } from "@/lib/services/analytics";
import { prisma } from "@/lib/db";
import { PageHeader, Card, CardBody, CardHeader } from "@/components/ui/card";
import { HBarChart, MonthlyChart, StatusDonut } from "@/components/charts";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Analytics() {
  await requireRole("REVIEWER", "HEAD", "ADMIN");
  const { lang, t } = await getT();
  const L = lang === "id";
  const s = await dashboardStats();
  const apps = await prisma.application.groupBy({ by: ["workflow"], _count: true });
  const stages = await prisma.application.groupBy({ by: ["stage"], _count: true });
  const due = await prisma.journal.findMany({ where: { OR: [{ reassessFlag: true }, { reassessDueAt: { lt: new Date() } }] }, orderBy: { reassessDueAt: "asc" }, take: 20 });
  return (
    <>
      <PageHeader title={t("nav.analytics")} subtitle={L ? "Analitik institusi. Angka bersifat deskriptif untuk pemantauan, bukan dasar keputusan individual." : "Institutional analytics. Figures are descriptive for monitoring, not a basis for individual decisions."} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title={L ? "Permohonan per bulan (6 bulan)" : "Applications per month (6 months)"} /><CardBody><MonthlyChart data={s.monthly} label={L ? "Permohonan" : "Applications"} /></CardBody></Card>
        <Card><CardHeader title={L ? "Status jurnal" : "Journal status"} /><CardBody><StatusDonut label="status" data={[{ name: t("status.GREEN"), value: s.green, color: "#15803d" }, { name: t("status.YELLOW"), value: s.yellow, color: "#d97706" }, { name: t("status.RED"), value: s.red, color: "#b91c1c" }]} /></CardBody></Card>
        <Card><CardHeader title={L ? "Permohonan menurut alur" : "Applications by workflow"} /><CardBody><HBarChart label="workflow" data={apps.map((a) => ({ name: t(`wf.${a.workflow}`), n: a._count }))} /></CardBody></Card>
        <Card><CardHeader title={L ? "Permohonan menurut tahap" : "Applications by stage"} /><CardBody><HBarChart label="stage" data={stages.map((a) => ({ name: t(`stage.${a.stage}`), n: a._count }))} /></CardBody></Card>
        <Card><CardHeader title={L ? "Ringkasan" : "Summary"} /><CardBody className="space-y-1 text-sm">
          <div>{L ? "Rata-rata waktu keputusan" : "Mean time to decision"}: <b>{s.turnaroundDays == null ? "—" : `${s.turnaroundDays.toFixed(1)} ${L ? "hari" : "days"}`}</b></div>
          <div>{L ? "Insiden situs klon" : "Clone-site incidents"}: <b>{s.cloneIncidents}</b></div>
          <div>{L ? "Surat diterbitkan" : "Letters issued"}: <b>{s.lettersIssued}</b></div>
        </CardBody></Card>
      </div>
      <Card className="mt-6"><CardHeader title={L ? "Pengingat validasi ulang jurnal" : "Journal revalidation reminders"} subtitle={L ? "Jurnal yang ditandai atau melewati jadwal validasi ulang menurut kebijakan." : "Journals flagged or past their policy revalidation date."} />
        <ul className="divide-y divide-slate-100">{due.map((j) => (<li key={j.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5 text-sm"><a className="font-semibold text-navy-800 underline" href={`/journals/${j.id}`}>{j.title}</a><span className="text-xs text-slate-500">{L ? "jatuh tempo" : "due"} {fmtDate(j.reassessDueAt)}{j.reassessFlag ? ` · ${L ? "ditandai" : "flagged"}` : ""}</span></li>))}
          {due.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">—</li>}</ul></Card>
    </>
  );
}
