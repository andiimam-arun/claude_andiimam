import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/engine/util";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { flagReassessAction } from "@/app/actions/investigations";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function JournalRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireRole("REVIEWER", "HEAD", "ADMIN");
  const [{ id }, sp, { lang, t }] = await Promise.all([params, searchParams, getT()]);
  const j = await prisma.journal.findUnique({ where: { id }, include: { assessments: { orderBy: { createdAt: "desc" } }, applications: { orderBy: { createdAt: "desc" } } } });
  if (!j) notFound();
  const L = lang === "id";
  const latest = j.assessments[0];
  const dom = parseJson<string[]>(j.verifiedDomainsJson, []);
  const warnings = parseJson<string[]>(j.knownWarningsJson, []);
  const manual = await prisma.evidence.findMany({ where: { journalId: id, origin: "MANUAL", retracted: false }, orderBy: { createdAt: "desc" } });
  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}{sp.error && <Notice kind="error">{sp.error}</Notice>}
      <PageHeader title={j.title} subtitle={`ISSN ${j.issn ?? "—"} · E-ISSN ${j.eissn ?? "—"} · ${j.publisher ?? "—"} · ${L ? "versi catatan" : "record version"} ${j.recordVersion}`}
        actions={<>{latest && <Link className="btn-primary" href={`/investigations/${latest.id}`}>{L ? "Buka penilaian terbaru" : "Open latest assessment"}</Link>}
          {user.role !== "ADMIN" && <form action={flagReassessAction}><input type="hidden" name="journalId" value={j.id} /><input type="hidden" name="back" value={`/journals/${j.id}`} /><input type="hidden" name="reason" value="Ditandai dari registri" /><button className="btn-outline" type="submit">{j.reassessFlag ? (L ? "Sudah ditandai ✓" : "Flagged ✓") : (L ? "Tandai penilaian ulang" : "Flag for reassessment")}</button></form>}</>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1"><CardHeader title={L ? "Identitas ternormalisasi" : "Normalized identity"} /><CardBody className="space-y-2 text-sm">
          <div><span className="label">{L ? "Judul alternatif" : "Alternative titles"}</span>{parseJson<string[]>(j.altTitlesJson, []).join("; ") || "—"}</div>
          <div><span className="label">Scopus Source ID</span>{j.scopusSourceId ?? "—"}</div>
          <div><span className="label">{L ? "Domain resmi terverifikasi" : "Verified domains"}</span>{dom.length ? dom.map((d) => <Pill key={d} tone="green" className="mr-1">{d}</Pill>) : "—"}</div>
          <div><span className="label">{L ? "Klaim indeksasi" : "Claimed indexing"}</span>{parseJson<string[]>(j.claimedIndexingJson, []).join(", ") || "—"}</div>
          <div><span className="label">{L ? "Sinyal peringatan dikenal" : "Known warning signals"}</span>{warnings.length ? warnings.map((w) => <Pill key={w} tone="amber" className="mr-1 mb-1">{w}</Pill>) : "—"}</div>
          <div><span className="label">{L ? "Verifikasi terakhir" : "Last verified"}</span>{fmtDate(j.lastVerifiedAt, true)}</div>
          <div><span className="label">{L ? "Jadwal validasi ulang" : "Revalidation due"}</span>{fmtDate(j.reassessDueAt)}{j.reassessFlag && <span className="ml-2 font-semibold text-warn">({j.reassessReason})</span>}</div>
        </CardBody></Card>
        <Card className="lg:col-span-2"><CardHeader title={L ? "Riwayat penilaian & indeksasi" : "Assessment & indexing history"} /><div className="overflow-x-auto"><table className="w-full">
          <thead><tr><th className="th">Ref.</th><th className="th">{L ? "Tanggal" : "Date"}</th><th className="th">{L ? "Status" : "Status"}</th><th className="th">Scopus</th><th className="th">{L ? "Kebijakan" : "Policy"}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{j.assessments.map((a) => { const d = parseJson<any>(a.decisionJson, {}); return (
            <tr key={a.id}><td className="td"><Link className="text-navy-700 underline" href={`/investigations/${a.id}`}>{a.refNumber}</Link></td><td className="td text-xs">{fmtDate(a.createdAt, true)}</td><td className="td"><StatusBadge status={a.journalStatus as any} lang={lang} /></td>
              <td className="td text-xs">{d.indexingStatus ? t(`idx.${d.indexingStatus}`) : "—"}{d.indexingBasis ? ` · ${t(`integ.${d.indexingBasis}`)}` : ""}</td><td className="td text-xs">v{a.policyVersion}</td></tr>); })}</tbody></table></div></Card>
        <Card className="lg:col-span-2"><CardHeader title={L ? "Bukti manual aktif" : "Active manual evidence"} /><CardBody>
          {manual.length === 0 ? <p className="text-sm text-slate-500">—</p> : <ul className="space-y-1.5 text-sm">{manual.map((m) => <li key={m.id}><Pill>{m.key}</Pill> {m.finding} <span className="text-xs text-slate-500">— {m.sourceName}, {fmtDate(m.createdAt)}</span></li>)}</ul>}
        </CardBody></Card>
        <Card className="lg:col-span-1"><CardHeader title={L ? "Permohonan terkait" : "Related applications"} /><CardBody>
          {j.applications.length === 0 ? <p className="text-sm text-slate-500">—</p> : <ul className="space-y-1.5 text-sm">{j.applications.map((a) => <li key={a.id}><Link className="text-navy-700 underline" href={`/applications/${a.id}`}>{a.refNumber}</Link> <span className="text-xs text-slate-500">{t(`stage.${a.stage}`)}</span></li>)}</ul>}
        </CardBody></Card>
      </div>
    </>
  );
}
