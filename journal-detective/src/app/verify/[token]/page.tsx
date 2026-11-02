import { ShieldCheck, ShieldX } from "lucide-react";
import { publicVerification } from "@/lib/services/letters";
import { t } from "@/lib/i18n";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Halaman publik: hanya informasi minimum untuk keaslian surat. Tanpa data pribadi lengkap. */
export default async function Verify({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = token.length < 60 ? await publicVerification(token) : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <div className="card w-full p-6">
        <div className="mb-4 flex items-center gap-2 text-navy-900"><span className="font-bold">Journal Detective</span><span className="text-xs text-slate-500">— verifikasi surat</span></div>
        {!v ? (
          <div role="alert"><ShieldX className="h-10 w-10 text-bad" aria-hidden /><h1 className="mt-2 text-xl font-bold text-bad-ink">Surat tidak ditemukan / not found</h1><p className="mt-1 text-sm text-slate-600">Kode verifikasi tidak dikenal atau surat belum diterbitkan secara resmi. / The code is unknown or the letter has not been officially issued.</p></div>
        ) : (
          <div>
            {v.status === "ISSUED" ? <ShieldCheck className="h-10 w-10 text-ok" aria-hidden /> : <ShieldX className="h-10 w-10 text-bad" aria-hidden />}
            <h1 className={`mt-2 text-xl font-bold ${v.status === "ISSUED" ? "text-ok-ink" : "text-bad-ink"}`}>{v.status === "ISSUED" ? "Surat sah / Letter is valid" : "Surat DICABUT / Letter REVOKED"}</h1>
            <dl className="mt-4 grid grid-cols-[130px_1fr] gap-y-1.5 text-sm">
              <dt className="font-semibold text-slate-600">Jenis</dt><dd>{t("id", `letter.${v.type}`)}</dd>
              <dt className="font-semibold text-slate-600">Nomor</dt><dd className="font-mono">{v.officialNumber}</dd>
              <dt className="font-semibold text-slate-600">Tanggal terbit</dt><dd>{fmtDate(v.issuedAt)}</dd>
              <dt className="font-semibold text-slate-600">Mahasiswa</dt><dd>{v.studentMasked}</dd>
              <dt className="font-semibold text-slate-600">Jurnal</dt><dd>{v.journalTitle}</dd>
              <dt className="font-semibold text-slate-600">Penerbit surat</dt><dd>{v.issuer}</dd>
            </dl>
            {v.demo && <p className="mt-3 rounded bg-warn-soft px-3 py-2 text-xs font-semibold text-warn-ink">Diterbitkan dengan kebijakan DEMONSTRASI — bukan dokumen institusional resmi.</p>}
          </div>
        )}
      </div>
    </main>
  );
}
