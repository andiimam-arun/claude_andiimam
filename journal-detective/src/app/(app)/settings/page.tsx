import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { getActivePolicy, listPolicies } from "@/lib/services/policyService";
import { getBranding, getTemplates } from "@/lib/services/settings";
import { DOC_TYPES, STAGES } from "@/lib/engine/types";
import { ROLES } from "@/lib/engine/approval";
import { getRetention, findExpiredDocuments } from "@/lib/ops/retention";
import { saveRetentionAction, savePolicyAction, saveBrandingAction, saveTemplatesAction, createUserAction, toggleUserAction } from "@/app/actions/admin";
import { Card, CardBody, CardHeader, PageHeader, Notice } from "@/components/ui/card";
import { Pill } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireRole("ADMIN", "HEAD");
  const [{ lang, t }, sp] = await Promise.all([getT(), searchParams]);
  const L = lang === "id";
  const [policy, history, branding, tpl, users, audits] = await Promise.all([
    getActivePolicy(), listPolicies(), getBranding(), getTemplates(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }), prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const c = policy.config;
  const retention = await getRetention();
  const expired = retention.documentRetentionDays ? await findExpiredDocuments(retention.documentRetentionDays) : [];
  return (
    <>
      {sp.notice && <Notice kind="ok">{sp.notice}</Notice>}{sp.error && <Notice kind="error">{sp.error}</Notice>}
      <PageHeader title={t("nav.settings")} subtitle={L ? "Perubahan kebijakan membuat VERSI BARU yang tercatat pada audit; tidak ada penimpaan." : "Policy changes create a NEW VERSION recorded in the audit log; nothing is overwritten."} />
      <Card className="mb-6">
        <CardHeader title={L ? `Editor kebijakan — versi aktif v${policy.version}` : `Policy editor — active version v${policy.version}`} subtitle={policy.isDemo ? t("app.demoPolicyBanner") : (L ? "Kebijakan RESMI (ditandai oleh Kepala Unit)" : "OFFICIAL policy (marked by the Head)")} action={<Pill tone={policy.isDemo ? "amber" : "green"}>{policy.isDemo ? "DEMO" : "OFFICIAL"}</Pill>} />
        <CardBody>
          <form action={savePolicyAction} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2"><span className="label">{L ? "Nama kebijakan" : "Policy name"}</span><input className="input" name="name" defaultValue={policy.name} required /></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="requireCurrentScopus" defaultChecked={c.requireCurrentScopus} className="mt-1" /> {L ? "Indeksasi Scopus aktif WAJIB" : "Current Scopus indexing is MANDATORY"}</label>
              <label><span className="label">{L ? "Penanganan cakupan dihentikan" : "Discontinued-coverage handling"}</span><select className="input" name="discontinuedHandling" defaultValue={c.discontinuedHandling}><option value="INELIGIBLE">{L ? "Tidak layak (MERAH kebijakan)" : "Ineligible (policy RED)"}</option><option value="NEEDS_REVIEW">{L ? "Perlu tinjauan (KUNING)" : "Needs review (YELLOW)"}</option></select></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acceptNationalAccredited" defaultChecked={c.acceptNationalAccredited} className="mt-1" /> {L ? "Terima jurnal nasional terakreditasi sebagai alternatif" : "Accept accredited national journals as an alternative"}</label>
              <label><span className="label">{L ? "Peringkat akreditasi yang diterima" : "Accepted accreditation levels"}</span><input className="input" name="acceptedAccreditationLevels" defaultValue={c.acceptedAccreditationLevels.join(", ")} /></label>
              <div><span className="label">{L ? "Kuartil subjek yang diwajibkan" : "Required subject quartiles"}</span><div className="flex gap-4 text-sm">{["Q1", "Q2", "Q3", "Q4"].map((q) => <label key={q} className="flex items-center gap-1.5"><input type="checkbox" name={`q_${q}`} defaultChecked={c.requiredQuartiles.includes(q as any)} /> {q}</label>)}</div></div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="quartileMandatory" defaultChecked={c.quartileMandatory} className="mt-1" /> {L ? "Persyaratan kuartil bersifat wajib (bukan anjuran)" : "Quartile requirement is mandatory (not advisory)"}</label>
              <label><span className="label">{L ? "Umur maksimum bukti indeksasi (hari)" : "Max indexing-evidence age (days)"}</span><input className="input" type="number" name="maxIndexEvidenceAgeDays" defaultValue={c.maxIndexEvidenceAgeDays} min={1} required /></label>
              <label><span className="label">{L ? "Tenggat tinjauan bukti (hari)" : "Evidence-review deadline (days)"}</span><input className="input" type="number" name="evidenceReviewDeadlineDays" defaultValue={c.evidenceReviewDeadlineDays} min={1} required /></label>
              <label><span className="label">{L ? "Interval penilaian ulang jurnal disetujui (hari; kosong = tidak berkala)" : "Reassessment interval for approved journals (days; empty = none)"}</span><input className="input" type="number" name="reassessmentIntervalDays" defaultValue={c.reassessmentIntervalDays ?? ""} min={30} /></label>
              <label><span className="label">{L ? "Peringatan penerimaan sangat cepat (< hari)" : "Very-fast acceptance warning (< days)"}</span><input className="input" type="number" name="fastAcceptanceWarnDays" defaultValue={c.fastAcceptanceWarnDays} min={0} required /></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="headMayOverridePolicyIneligible" defaultChecked={c.headMayOverridePolicyIneligible} className="mt-1" /> {L ? "Kepala Unit boleh meng-override ketidaklayakan kebijakan dengan justifikasi (identitas palsu terkonfirmasi TIDAK pernah dapat di-override)" : "Head may override policy ineligibility with justification (confirmed identity fraud can NEVER be overridden)"}</label>
              <label className="md:col-span-2"><span className="label">{L ? "Kunci bukti yang wajib dieskalasi (pisahkan koma)" : "Evidence keys requiring escalation (comma separated)"}</span><input className="input" name="escalationEvidenceKeys" defaultValue={c.escalationEvidenceKeys.join(", ")} /></label>
            </div>
            <div><span className="label">{L ? "Dokumen wajib per tahap" : "Required documents per stage"}</span>
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="th">{L ? "Tahap" : "Stage"}</th>{DOC_TYPES.filter((d) => d !== "OTHER").map((d) => <th key={d} className="th !px-1 text-center" title={t(`doc.${d}`)}>{d.split("_").map((w) => w[0]).join("")}</th>)}</tr></thead>
                <tbody>{STAGES.map((s) => (<tr key={s} className="border-t border-slate-100"><td className="td whitespace-nowrap font-medium">{t(`stage.${s}`)}</td>{DOC_TYPES.filter((d) => d !== "OTHER").map((d) => <td key={d} className="td text-center"><input type="checkbox" name={`doc_${s}_${d}`} defaultChecked={c.requiredDocuments[s]?.includes(d)} aria-label={`${s} ${d}`} /></td>)}</tr>))}</tbody></table></div>
              <p className="mt-1 text-[11px] text-slate-500">{DOC_TYPES.filter((d) => d !== "OTHER").map((d) => `${d.split("_").map((w) => w[0]).join("")} = ${t(`doc.${d}`)}`).join(" · ")}</p></div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2"><span className="label">{L ? "Catatan perubahan (wajib untuk audit) *" : "Change note (required for audit) *"}</span><input className="input" name="note" required minLength={5} /></label>
              {user.role === "HEAD" ? <label className="flex items-start gap-2 text-sm md:col-span-2"><input type="checkbox" name="isOfficial" className="mt-1" /> {L ? "Tandai sebagai kebijakan RESMI fakultas (saya pejabat berwenang yang mengesahkan aturan ini)" : "Mark as the OFFICIAL faculty policy (I am the authorized officer endorsing these rules)"}</label>
                : <p className="text-xs text-slate-500 md:col-span-2">{L ? "Hanya Kepala Unit yang dapat menandai versi sebagai RESMI. Versi yang Anda terbitkan tetap berlabel DEMO." : "Only the Head can mark a version as OFFICIAL. Versions you publish remain labelled DEMO."}</p>}
            </div>
            <button className="btn-primary" type="submit">{L ? "Terbitkan versi kebijakan baru" : "Publish new policy version"}</button>
          </form>
          <h3 className="mt-6 text-sm font-bold">{L ? "Riwayat versi" : "Version history"}</h3>
          <ul className="mt-2 space-y-1 text-xs">{history.map((h) => <li key={h.id}>v{h.version} · {h.name} · <Pill tone={h.isDemo ? "amber" : "green"}>{h.isDemo ? "DEMO" : "OFFICIAL"}</Pill> · {fmtDate(h.createdAt, true)} · {h.active ? <b>{L ? "aktif" : "active"}</b> : ""} {h.note ? `· ${h.note}` : ""}</li>)}</ul>
        </CardBody>
      </Card>

      <Card className="mb-6"><CardHeader title={L ? "Retensi & penghapusan dokumen" : "Document retention & deletion"} subtitle={L ? "Tidak ada penghapusan otomatis. Dokumen pada permohonan FINAL yang melewati masa retensi dilaporkan; penghapusan permanen hanya lewat tindakan eksplisit." : "No automatic deletion. Documents of FINAL applications past retention are reported; permanent deletion only by explicit action."} />
        <CardBody><form action={saveRetentionAction} className="flex flex-wrap items-end gap-3"><label><span className="label">{L ? "Masa retensi (hari; kosong = tanpa batas otomatis)" : "Retention (days; empty = no automatic limit)"}</span><input className="input" type="number" name="days" min={30} max={3650} defaultValue={retention.documentRetentionDays ?? ""} /></label><button className="btn-primary" type="submit">{L ? "Simpan" : "Save"}</button></form>
          <p className="mt-3 text-sm">{retention.documentRetentionDays ? `${expired.length} ${L ? "permohonan final berisi dokumen melewati masa retensi." : "final applications hold documents past retention."}` : (L ? "Masa retensi belum ditetapkan." : "Retention not set.")}</p></CardBody></Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title={L ? "Identitas & penandatangan surat" : "Letter branding & signatory"} /><CardBody>
          <form action={saveBrandingAction} className="grid gap-3">
            {([["institution", "Institusi"], ["faculty", "Fakultas"], ["unit", "Unit"], ["address", "Alamat"], ["city", "Kota"], ["approverName", "Nama pejabat penandatangan"], ["approverTitle", "Jabatan"], ["approverNip", "NIP"]] as const).map(([k, label]) => (
              <label key={k}><span className="label">{label}</span><input className="input" name={k} defaultValue={(branding as any)[k]} /></label>))}
            <button className="btn-primary" type="submit">{L ? "Simpan" : "Save"}</button>
          </form></CardBody></Card>
        <Card><CardHeader title={L ? "Templat surat (Bahasa Indonesia)" : "Letter templates (Indonesian)"} subtitle="{{policyVersion}}" /><CardBody>
          <form action={saveTemplatesAction} className="space-y-4">
            {(["PRE_SUBMISSION", "POST_ACCEPTANCE_PAYMENT"] as const).map((ty) => (<fieldset key={ty} className="space-y-2 rounded-lg border border-slate-200 p-3"><legend className="px-1 text-xs font-bold">{t(`letter.${ty}`)}</legend>
              {(["title", "opening", "approval", "closing"] as const).map((f) => <label key={f}><span className="label">{f}</span><textarea className="input" rows={f === "title" ? 1 : 3} name={`${ty}_${f}`} defaultValue={tpl[ty][f]} /></label>)}</fieldset>))}
            <button className="btn-primary" type="submit">{L ? "Simpan templat" : "Save templates"}</button>
          </form></CardBody></Card>
      </div>

      {user.role === "ADMIN" && (
        <Card className="mt-6" ><CardHeader title={L ? "Pengguna" : "Users"} /><CardBody>
          <div id="pengguna" className="overflow-x-auto"><table className="mb-4 w-full"><thead><tr><th className="th">{L ? "Nama" : "Name"}</th><th className="th">Email</th><th className="th">{L ? "Peran" : "Role"}</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-slate-100">{users.map((u) => (<tr key={u.id}><td className="td">{u.name}</td><td className="td text-xs">{u.email}</td><td className="td">{t(`role.${u.role}`)}</td><td className="td">{u.active ? "aktif" : "nonaktif"}</td>
              <td className="td"><form action={toggleUserAction}><input type="hidden" name="id" value={u.id} /><button className="btn-outline !px-2 !py-1 text-xs" type="submit">{u.active ? (L ? "Nonaktifkan" : "Deactivate") : (L ? "Aktifkan" : "Activate")}</button></form></td></tr>))}</tbody></table></div>
          <form action={createUserAction} className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
            <label><span className="label">{L ? "Nama" : "Name"}</span><input className="input" name="name" required /></label>
            <label><span className="label">Email</span><input className="input" type="email" name="email" required /></label>
            <label><span className="label">{L ? "Peran" : "Role"}</span><select className="input" name="role">{ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select></label>
            <label><span className="label">{L ? "Kata sandi (min. 10)" : "Password (min. 10)"}</span><input className="input" type="password" name="password" required minLength={10} autoComplete="new-password" /></label>
            <label><span className="label">NIM</span><input className="input" name="studentNumber" /></label>
            <label><span className="label">{L ? "Program studi" : "Study program"}</span><input className="input" name="studyProgram" /></label>
            <div className="md:col-span-3"><button className="btn-primary" type="submit">{L ? "Tambah pengguna" : "Add user"}</button></div>
          </form></CardBody></Card>
      )}

      <Card className="mt-6"><CardHeader title={L ? "Log audit (40 terbaru)" : "Audit log (latest 40)"} /><div className="max-h-96 overflow-auto"><table className="w-full">
        <thead><tr><th className="th">{L ? "Waktu" : "Time"}</th><th className="th">{L ? "Pelaku" : "Actor"}</th><th className="th">{L ? "Aksi" : "Action"}</th><th className="th">{L ? "Objek" : "Entity"}</th><th className="th">v</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{audits.map((a) => (<tr key={a.id}><td className="td whitespace-nowrap text-xs text-slate-500">{fmtDate(a.createdAt, true)}</td><td className="td text-xs">{a.actorName}{a.actorRole ? ` (${a.actorRole})` : ""}</td><td className="td text-xs font-semibold">{a.action}</td><td className="td text-xs">{a.entity} {a.entityId?.slice(-6)}</td><td className="td text-xs">{a.policyVersion ?? ""}</td></tr>))}</tbody></table></div></Card>
    </>
  );
}
