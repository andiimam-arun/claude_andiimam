import Link from "next/link";
import { ShieldCheck, ShieldAlert, ShieldX, Database, Clock, Stamp, Mail, Siren, Timer } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { dashboardStats } from "@/lib/services/analytics";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { HBarChart, MonthlyChart, StatusDonut } from "@/components/charts";
import { fmtDate } from "@/lib/utils";
import { evaluateApplication } from "@/lib/services/applications";

function Stat({ icon: Icon, label, value, tone, href }: { icon: any; label: string; value: React.ReactNode; tone: string; href?: string }) {
  const inner = (
    <div className="card flex items-center gap-3.5 p-4 transition hover:shadow-md">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden /></div>
      <div><div className="text-2xl font-extrabold leading-none text-navy-950">{value}</div><div className="mt-1 text-xs font-medium text-slate-600">{label}</div></div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [user, { lang, t }, sp] = await Promise.all([requireUser(), getT(), searchParams]);
  const flash = sp.error === "forbidden" ? <Notice kind="error">{lang === "id" ? "Anda tidak memiliki akses ke halaman tersebut." : "You do not have access to that page."}</Notice> : null;

  if (user.role === "STUDENT") {
    const apps = await prisma.application.findMany({ where: { studentUserId: user.id }, orderBy: { createdAt: "desc" } });
    return (
      <>
        {flash}
        <PageHeader title={lang === "id" ? "Permohonan Saya" : "My Applications"} subtitle={lang === "id" ? "Pantau status klirens publikasi dan permintaan klarifikasi dari peninjau." : "Track clearance status and reviewer clarification requests."}
          actions={<Link className="btn-primary" href="/applications/new">{lang === "id" ? "Ajukan Permohonan Baru" : "New Application"}</Link>} />
        <div className="grid gap-4 md:grid-cols-2">
          {apps.length === 0 && <Card><CardBody className="text-sm text-slate-600">{lang === "id" ? "Belum ada permohonan." : "No applications yet."}</CardBody></Card>}
          {await Promise.all(apps.map(async (a) => {
            const ev = await evaluateApplication(a);
            return (
              <Link key={a.id} href={`/applications/${a.id}`} className="card block p-4 hover:shadow-md">
                <div className="text-xs text-slate-500">{a.refNumber} · {t(`stage.${a.stage}`)}</div>
                <div className="mt-1 font-semibold text-navy-950">{a.manuscriptTitle}</div>
                <div className="mt-0.5 text-sm text-slate-600">{a.journalName}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {ev.final && <StatusBadge status={ev.final.status} lang={lang} />}
                  <span className="text-xs text-slate-600">{t(`wf.${a.workflow}`)}</span>
                </div>
              </Link>
            );
          }))}
        </div>
      </>
    );
  }

  const s = await dashboardStats();
  return (
    <>
      {flash}
      <PageHeader title={t("nav.dashboard")} subtitle={t("app.tagline")} actions={<Link className="btn-primary" href="/investigations/new">{t("nav.investigate")}</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Database} label={lang === "id" ? "Total jurnal diinvestigasi" : "Total journals investigated"} value={s.totalJournals} tone="bg-navy-100 text-navy-800" href="/journals" />
        <Stat icon={ShieldCheck} label={`${t("status.GREEN")} — ${t("status.GREEN.long")}`} value={s.green} tone="bg-ok-soft text-ok" href="/journals?status=GREEN" />
        <Stat icon={ShieldAlert} label={`${t("status.YELLOW")} — ${t("status.YELLOW.long")}`} value={s.yellow} tone="bg-warn-soft text-warn" href="/journals?status=YELLOW" />
        <Stat icon={ShieldX} label={`${t("status.RED")} — ${t("status.RED.long")}`} value={s.red} tone="bg-bad-soft text-bad" href="/journals?status=RED" />
        <Stat icon={Clock} label={lang === "id" ? "Permohonan menunggu bukti" : "Applications awaiting evidence"} value={s.awaitingEvidence} tone="bg-navy-100 text-navy-800" href="/applications?workflow=NEEDS_EVIDENCE" />
        <Stat icon={Stamp} label={lang === "id" ? "Menunggu persetujuan akhir" : "Awaiting final approval"} value={s.awaitingApproval} tone="bg-navy-100 text-navy-800" href="/approvals" />
        <Stat icon={Siren} label={lang === "id" ? "Insiden situs klon terkonfirmasi" : "Confirmed cloned-site incidents"} value={s.cloneIncidents} tone="bg-bad-soft text-bad" href="/journals?status=RED" />
        <Stat icon={Mail} label={lang === "id" ? "Surat klirens diterbitkan" : "Clearance letters issued"} value={s.lettersIssued} tone="bg-navy-100 text-navy-800" href="/letters" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title={lang === "id" ? "Tren permohonan bulanan" : "Monthly application trend"} /><CardBody><MonthlyChart data={s.monthly} label={lang === "id" ? "Permohonan" : "Applications"} /></CardBody></Card>
        <Card><CardHeader title={lang === "id" ? "Sebaran status jurnal" : "Journal status distribution"} /><CardBody>
          <StatusDonut label={lang === "id" ? "Sebaran status jurnal" : "Journal status distribution"} data={[
            { name: `${t("status.GREEN")}`, value: s.green, color: "#15803d" }, { name: `${t("status.YELLOW")}`, value: s.yellow, color: "#d97706" }, { name: `${t("status.RED")}`, value: s.red, color: "#b91c1c" }]} />
        </CardBody></Card>
        <Card><CardHeader title={lang === "id" ? "Status indeksasi (Scopus)" : "Indexing status (Scopus)"} /><CardBody>
          <HBarChart label="Indexing" data={s.indexingDist.map((d) => ({ name: t(`idx.${d.k}`), n: d.n }))} />
        </CardBody></Card>
        <Card><CardHeader title={lang === "id" ? "Jurnal paling sering diinvestigasi" : "Most frequently investigated journals"} /><CardBody>
          {s.topJournals.length ? <HBarChart label="Top" data={s.topJournals.map((j) => ({ name: j.title.slice(0, 28), n: j.n }))} /> : <p className="text-sm text-slate-500">—</p>}
        </CardBody></Card>
        <Card><CardHeader title={lang === "id" ? "Waktu penyelesaian tinjauan" : "Review turnaround time"} /><CardBody>
          <div className="flex items-center gap-3"><Timer className="h-8 w-8 text-navy-700" aria-hidden />
            <div><div className="text-3xl font-extrabold text-navy-950">{s.turnaroundDays == null ? "—" : s.turnaroundDays.toFixed(1)}</div>
              <div className="text-xs text-slate-600">{lang === "id" ? "hari rata-rata dari pengajuan ke keputusan final" : "average days from submission to final decision"}</div></div></div>
          <p className="mt-3 text-xs text-slate-500">{lang === "id" ? `${s.openApplications} permohonan masih terbuka · ${s.flaggedReassess} jurnal ditandai penilaian ulang` : `${s.openApplications} open applications · ${s.flaggedReassess} journals flagged for reassessment`}</p>
        </CardBody></Card>
      </div>
      <Card className="mt-6">
        <CardHeader title={lang === "id" ? "Aktivitas investigasi terbaru" : "Recent investigation activity"} />
        <div className="overflow-x-auto"><table className="w-full">
          <thead><tr><th className="th">{lang === "id" ? "Waktu" : "Time"}</th><th className="th">{lang === "id" ? "Pelaku" : "Actor"}</th><th className="th">{lang === "id" ? "Aksi" : "Action"}</th><th className="th">{lang === "id" ? "Objek" : "Entity"}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {s.recentAudit.map((a) => (<tr key={a.id}><td className="td whitespace-nowrap text-slate-500">{fmtDate(a.createdAt, true)}</td><td className="td">{a.actorName}</td><td className="td font-medium">{a.action}</td><td className="td text-slate-600">{a.entity}</td></tr>))}
          </tbody></table></div>
      </Card>
    </>
  );
}
