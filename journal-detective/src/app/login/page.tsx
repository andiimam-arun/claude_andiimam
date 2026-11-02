import { ShieldCheck } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, lang] = await Promise.all([searchParams, getLang()]);
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center bg-navy-900 px-8 py-12 text-white sm:px-16">
        <ShieldCheck className="mb-5 h-12 w-12" aria-hidden />
        <h1 className="text-4xl font-extrabold tracking-tight">Journal Detective</h1>
        <p className="mt-3 max-w-md text-lg text-navy-100">{t(lang, "app.tagline")}</p>
        <p className="mt-8 max-w-md text-sm text-navy-200">
          Platform pendukung keputusan integritas jurnal dan klirens publikasi — Unit Publikasi Fakultas, Universitas Hasanuddin. Sistem ini bersifat penasihat; keputusan resmi hanya oleh pejabat berwenang.
        </p>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <form action={loginAction} className="card w-full max-w-sm space-y-4 p-6">
          <h2 className="text-xl font-bold text-navy-900">Masuk</h2>
          {error && <div role="alert" className="rounded-lg border border-red-300 bg-bad-soft px-3 py-2 text-sm text-bad-ink">{error}</div>}
          <label className="block"><span className="label">Email</span><input className="input" name="email" type="email" autoComplete="username" required /></label>
          <label className="block"><span className="label">Kata sandi</span><input className="input" name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn-primary w-full" type="submit">Masuk</button>
          <p className="text-xs text-slate-500">Akun demonstrasi (fiktif) dibuat oleh <code>npm run db:seed</code>; lihat README.</p>
        </form>
      </div>
    </div>
  );
}
