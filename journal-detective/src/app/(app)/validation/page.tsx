import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { coverageSummary } from "@/lib/services/validation";
import { createShellsAction } from "@/app/actions/validation";
import { Card, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Validation({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireRole("REVIEWER", "HEAD");
  const [{ lang, t }, sp] = await Promise.all([getT(), searchParams]);
  const L = lang === "id";
  const [cov, cases] = await Promise.all([coverageSummary(), prisma.validationCase.findMany({ include: { runs: { orderBy: { runNo: "desc" }, take: 1 }, references: { take: 1 } }, orderBy: { caseCode: "asc" } })]);
  const realCases = cases.filter((c) => !c.isFictionalFixture);
  const realRun = realCases.filter((c) => c.runs.length).length;
  const STATUS: Record<string, [string, string, "slate" | "amber" | "navy" | "green" | "red"]> = {
    AWAITING_MANUAL_REFERENCE: ["MENUNGGU REFERENSI MANUAL", "AWAITING MANUAL REFERENCE", "amber"], REFERENCE_RECORDED: ["REFERENSI DICATAT — BELUM DIJALANKAN", "REFERENCE RECORDED — NOT RUN", "navy"],
    RUN_COMPLETED: ["SELESAI DIJALANKAN (SEPAKAT)", "RUN COMPLETED (AGREES)", "green"], DISCREPANCY_OPEN: ["PERBEDAAN TERBUKA", "DISCREPANCY OPEN", "red"], RESOLVED: ["SELESAI", "RESOLVED", "green"],
  };
  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}{sp.error && <Notice kind="error">{sp.error}</Notice>}
      <PageHeader title={t("nav.validation")} subtitle={L ? "Membandingkan rekomendasi aplikasi dengan penilaian manual independen atas jurnal & situs NYATA. Lulus uji perangkat lunak ≠ akurat di dunia nyata; keduanya dilaporkan terpisah." : "Compare the application's recommendations with independent manual assessments of REAL journals and sites. Passing software tests ≠ real-world accuracy; they are reported separately."}
        actions={<><Link className="btn-primary" href="/validation/new">{L ? "Kasus baru" : "New case"}</Link><a className="btn-outline" href="/api/validation/export">{L ? "Ekspor CSV (tanpa narasi)" : "Export CSV (no narrative)"}</a>{user.role === "HEAD" && <a className="btn-outline" href="/api/validation/export?narrative=1">{L ? "Ekspor + narasi (Kepala)" : "Export + narrative (Head)"}</a>}</>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><div className="text-3xl font-extrabold text-navy-950">{realCases.length}</div><div className="text-xs text-slate-600">{L ? "kasus NYATA terdaftar" : "REAL cases registered"}</div></div>
        <div className="card p-4"><div className="text-3xl font-extrabold text-navy-950">{realRun}</div><div className="text-xs text-slate-600">{L ? "kasus nyata yang sudah dibandingkan" : "real cases already compared"}</div></div>
        <div className="card p-4"><div className="text-3xl font-extrabold text-navy-950">{cases.filter((c) => c.isFictionalFixture).length}</div><div className="text-xs text-slate-600">{L ? "fixture FIKTIF (tidak dihitung sebagai validasi nyata)" : "FICTIONAL fixtures (not counted as real validation)"}</div></div>
      </div>
      {realRun === 0 && <Notice kind="warn">{L ? "Validasi dunia nyata BELUM dilakukan: belum ada kasus nyata dengan referensi manual dan perbandingan. Tidak ada klaim akurasi yang dapat dibuat." : "Real-world validation has NOT been performed: no real case has a manual reference and comparison yet. No accuracy claim can be made."}</Notice>}

      <Card className="mb-6"><CardHeader title={L ? "Cakupan 10 skenario (kasus NYATA)" : "Coverage of the 10 scenarios (REAL cases)"} subtitle={L ? "Kasus fiktif ditampilkan terpisah dan tidak mengisi cakupan." : "Fictional cases are shown separately and do not fill coverage."}
        action={<form action={createShellsAction}><button className="btn-outline text-xs" type="submit">{L ? "Buat kerangka cakupan (kosong)" : "Create empty coverage shells"}</button></form>} />
        <div className="overflow-x-auto"><table className="w-full">
          <thead><tr><th className="th">{L ? "Skenario" : "Scenario"}</th><th className="th">{L ? "Kasus nyata" : "Real cases"}</th><th className="th">{L ? "Ber-referensi" : "With reference"}</th><th className="th">{L ? "Dijalankan" : "Run"}</th><th className="th">{L ? "Sepakat / Beda" : "Agree / Differ"}</th><th className="th">{L ? "Fixture fiktif" : "Fictional fixtures"}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{cov.map((c) => (
            <tr key={c.code}><td className="td">{L ? c.id : c.en}</td><td className="td">{c.realCases}</td><td className="td">{c.realWithReference}</td><td className="td">{c.realRun}</td><td className="td">{c.realRun ? `${c.realAgree} / ${c.realDisagree}` : <Pill tone="amber">{L ? "BELUM DIJALANKAN" : "NOT RUN"}</Pill>}</td><td className="td text-slate-500">{c.fictionalFixtures}</td></tr>))}</tbody></table></div></Card>

      <Card><CardHeader title={L ? "Kasus" : "Cases"} /><div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className="th">ID</th><th className="th">{L ? "Jurnal" : "Journal"}</th><th className="th">{L ? "Skenario" : "Scenario"}</th><th className="th">{L ? "Tahap" : "Stage"}</th><th className="th">Status</th><th className="th">{L ? "Jenis" : "Kind"}</th><th className="th">{L ? "Terakhir" : "Last"}</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{cases.map((c) => { const st = STATUS[c.status] ?? [c.status, c.status, "slate" as const]; return (
          <tr key={c.id} className="hover:bg-slate-50"><td className="td"><Link className="font-semibold text-navy-800 underline" href={`/validation/${c.id}`}>{c.caseCode}</Link></td><td className="td max-w-xs">{c.title}<div className="font-mono text-[11px] text-slate-500">{c.issn ?? ""}</div></td>
            <td className="td text-xs">{c.category}</td><td className="td text-xs">{t(`stage.${c.stage}`)}</td><td className="td"><Pill tone={st[2]}>{L ? st[0] : st[1]}</Pill></td>
            <td className="td">{c.isFictionalFixture ? <Pill tone="amber">{L ? "FIKTIF — bukan validasi nyata" : "FICTIONAL — not real validation"}</Pill> : <Pill tone="navy">{L ? "NYATA" : "REAL"}</Pill>}</td><td className="td text-xs">{fmtDate(c.updatedAt)}</td></tr>); })}
          {cases.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>{L ? "Belum ada kasus. Gunakan 'Kasus baru' atau 'Buat kerangka cakupan'." : "No cases yet. Use 'New case' or 'Create empty coverage shells'."}</td></tr>}</tbody></table></div></Card>
    </>
  );
}
