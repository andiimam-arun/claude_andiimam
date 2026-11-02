import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/engine/util";
import type { LetterSnapshot } from "@/lib/services/letters";
import { evaluateApplication } from "@/lib/services/applications";
import { checkOfficialIssuance, type WorkflowState } from "@/lib/engine/approval";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { Pill } from "@/components/StatusBadge";
import { issueLetterAction, revokeLetterAction } from "@/app/actions/letters";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LetterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser();
  const [{ id }, sp, { lang, t }] = await Promise.all([params, searchParams, getT()]);
  const l = await prisma.letter.findUnique({ where: { id }, include: { application: true } });
  if (!l) notFound();
  if (user.role === "STUDENT" && (l.application.studentUserId !== user.id || l.status === "DRAFT")) notFound();
  const L = lang === "id";
  const snap = parseJson<LetterSnapshot>(l.snapshotJson, null as any);
  const ev = await evaluateApplication(l.application);
  const chk = checkOfficialIssuance({ role: user.role, state: l.application.workflow as WorkflowState, final: ev.final, officialNumber: "x", isOverrideApproved: !!l.application.overrideJson });
  const draft = l.status !== "ISSUED";
  const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}{sp.error && <Notice kind="error">{sp.error}</Notice>}
      <PageHeader title={t(`letter.${l.type}`)} subtitle={`${l.application.refNumber} · ${l.application.studentName}`} actions={<><Pill tone={l.status === "ISSUED" ? "green" : l.status === "REVOKED" ? "red" : "amber"}>{t(`letter.${l.status}`)}</Pill><a className="btn-primary" href={`/api/letters/${l.id}/pdf`}><Download className="h-4 w-4" aria-hidden /> PDF</a></>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-white p-8 shadow-card" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {draft && <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center"><div className="-rotate-[30deg] select-none text-5xl font-extrabold tracking-widest text-red-600/15 sm:text-6xl">{l.status === "REVOKED" ? "DICABUT" : "DRAF — BELUM DISETUJUI"}</div></div>}
            <div className="relative">
              <div className="text-center"><div className="text-lg font-bold">{snap.branding.institution.toUpperCase()}</div><div className="font-semibold">{snap.branding.faculty}</div><div>{snap.branding.unit}</div><div className="text-xs text-slate-500">{snap.branding.address}</div><hr className="my-3 border-navy-800" /></div>
              <h2 className="text-center text-base font-bold">{snap.title}</h2>
              <p className="mt-1 text-center text-sm">{draft ? "Nomor: [NOMOR SURAT RESMI — diisi oleh pejabat berwenang saat penerbitan]" : `Nomor: ${l.officialNumber}`}</p>
              <p className="mb-4 text-center text-xs text-slate-500">Nomor penilaian: {snap.assessmentRef}</p>
              {snap.policyIsDemo && <p className="mb-3 text-center text-xs font-bold text-bad">PERHATIAN: dihasilkan dengan KEBIJAKAN DEMONSTRASI (bukan peraturan resmi fakultas).</p>}
              <p className="text-sm">{snap.opening}</p>
              <dl className="my-3 grid grid-cols-[150px_1fr] gap-x-3 gap-y-1 text-sm">
                {([["Nama mahasiswa", snap.student.name], ["NIM", snap.student.number], ["Program studi", snap.student.program], ["Dosen pembimbing", snap.student.supervisor], ["Judul naskah", snap.manuscript.title], ["Tahap", snap.manuscript.stage],
                  ["Jurnal", snap.journal.title], ["ISSN / E-ISSN", [snap.journal.issn, snap.journal.eissn].filter(Boolean).join(" / ") || "-"], ["Penerbit", snap.journal.publisher ?? "-"],
                  ["Situs resmi terverifikasi", snap.journal.verifiedWebsites.join(", ") || "Belum ada domain resmi terverifikasi"], ["Situs yang diajukan", snap.journal.submittedWebsite ?? "-"], ["Penilaian indeksasi", snap.indexingAssessment], ["Tanggal penilaian", snap.assessmentDate],
                  ["Status jurnal", snap.statuses.journal], ["Status administratif", snap.statuses.administrative], ["Rekomendasi akhir", snap.statuses.final]] as const).map(([k, v]) => (<div key={k} className="contents"><dt className="font-semibold text-slate-600">{k}</dt><dd>{v}</dd></div>))}
              </dl>
              <p className="text-sm font-semibold">Kesimpulan verifikasi:</p>
              <ul className="mb-3 list-disc pl-5 text-xs">{snap.conclusions.map((c, i) => <li key={i}>{c}</li>)}</ul>
              <p className="text-sm">{snap.approvalStatement}</p>
              {snap.override && <p className="mt-2 text-xs">Catatan pengecualian oleh pejabat: {snap.override.justification}</p>}
              <p className="mt-2 text-xs text-slate-500">{snap.closing}</p>
              <div className="mt-6 text-sm"><div>{snap.branding.city}, {l.approvedAt ? fmtDate(l.approvedAt) : "[tanggal penerbitan]"}</div><div>{draft ? "Menyetujui," : `${l.approverTitle},`}</div>
                <div className="my-6 text-xs text-slate-500">{draft ? "[Belum disetujui — draf tidak berlaku sebagai surat resmi]" : "[Tempat tanda tangan basah / tanda tangan elektronik tersertifikasi — integrasi belum diaktifkan]"}</div>
                <div className="font-bold">{l.approverName || snap.branding.approverName || "[Nama pejabat berwenang]"}</div></div>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          {l.status === "DRAFT" && (
            <Card><CardHeader title={L ? "Penerbitan surat resmi" : "Issue official letter"} subtitle={L ? "Hanya Kepala Unit, setelah permohonan DISETUJUI." : "Head of Unit only, after the application is APPROVED."} /><CardBody>
              {user.role !== "HEAD" ? <Notice kind="warn">{L ? "Peran Anda hanya dapat melihat/mengekspor draf berwatermark. Penerbitan resmi diblokir." : "Your role may only view/export the watermarked draft. Official issuance is blocked."}</Notice>
                : !chk.ok && chk.error !== undefined && chk.error !== "NUMBER_REQUIRED" ? <Notice kind="warn">{chk.error === "NOT_APPROVED" ? (L ? "Permohonan belum berstatus DISETUJUI. Setujui terlebih dahulu pada halaman permohonan." : "The application is not APPROVED yet. Approve it first on the application page.") : (L ? "Klirens diblokir; surat resmi tidak dapat diterbitkan." : "Clearance is blocked; an official letter cannot be issued.")}</Notice>
                : (<form action={issueLetterAction} className="space-y-3"><input type="hidden" name="letterId" value={l.id} />
                  <label><span className="label">{L ? "Nomor surat resmi (dimasukkan pejabat)" : "Official letter number (entered by the officer)"}</span><input className="input" name="officialNumber" required placeholder="mis. 123/UN4.x/PP/2026" /></label>
                  <button className="btn-ok w-full" type="submit">{L ? "Setujui & terbitkan surat resmi" : "Issue official letter"}</button></form>)}
            </CardBody></Card>
          )}
          {l.status === "ISSUED" && (<Card><CardHeader title={L ? "Verifikasi publik (QR)" : "Public verification (QR)"} /><CardBody className="space-y-2 text-sm">
            <p className="break-all font-mono text-xs">{base}/verify/{l.verifyToken}</p><p className="text-xs text-slate-600">{L ? "Halaman hanya menampilkan informasi minimum." : "The page shows minimum information only."}</p>
            {user.role === "HEAD" && <form action={revokeLetterAction} className="space-y-2 border-t border-slate-100 pt-3"><input type="hidden" name="letterId" value={l.id} /><input className="input" name="reason" placeholder={L ? "Alasan pencabutan" : "Revocation reason"} required minLength={10} /><button className="btn-danger w-full" type="submit">{L ? "Cabut surat" : "Revoke letter"}</button></form>}
          </CardBody></Card>)}
          <Card><CardHeader title={L ? "Kebijakan & persetujuan" : "Policy & approval"} /><CardBody className="space-y-1 text-sm">
            <div><span className="label">{L ? "Alur permohonan" : "Application workflow"}</span>{t(`wf.${l.application.workflow}`)}</div>
            <div><span className="label">{L ? "Versi kebijakan pada surat" : "Policy version on letter"}</span>v{l.policyVersion}</div>
            {l.approvedAt && <div><span className="label">{L ? "Disetujui" : "Approved"}</span>{l.approverName} · {fmtDate(l.approvedAt, true)}</div>}
          </CardBody></Card>
        </div>
      </div>
    </>
  );
}
