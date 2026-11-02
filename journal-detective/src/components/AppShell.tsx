import Link from "next/link";
import { LayoutDashboard, Search, Database, History, ClipboardCheck, GraduationCap, FileSearch, Stamp, Mail, BarChart3, Library, Settings, ShieldCheck, LogOut } from "lucide-react";
import { NAV_ACCESS, type NavKey } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { t, type Lang } from "@/lib/i18n";
import { logoutAction, setLangAction } from "@/app/actions/auth";

const ITEMS: Array<{ key: NavKey; href: string; Icon: typeof Search }> = [
  { key: "dashboard", href: "/", Icon: LayoutDashboard },
  { key: "investigate", href: "/investigations/new", Icon: Search },
  { key: "journals", href: "/journals", Icon: Database },
  { key: "assessments", href: "/assessments", Icon: History },
  { key: "validation", href: "/validation", Icon: ClipboardCheck },
  { key: "applications", href: "/applications", Icon: GraduationCap },
  { key: "evidence", href: "/evidence-review", Icon: FileSearch },
  { key: "approvals", href: "/approvals", Icon: Stamp },
  { key: "letters", href: "/letters", Icon: Mail },
  { key: "analytics", href: "/analytics", Icon: BarChart3 },
  { key: "sources", href: "/sources", Icon: Library },
  { key: "settings", href: "/settings", Icon: Settings },
];

export function AppShell({ user, lang, demoPolicy, mode, children }: { user: SessionUser; lang: Lang; demoPolicy: boolean; mode: "DEMO" | "PILOT"; children: React.ReactNode }) {
  const items = ITEMS.filter((i) => NAV_ACCESS[i.key].includes(user.role));
  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print bg-navy-900 text-navy-100 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <ShieldCheck className="h-7 w-7 text-white" aria-hidden />
          <div>
            <div className="text-base font-bold leading-tight text-white">Journal Detective</div>
            <div className="text-[10px] leading-tight text-navy-200">Universitas Hasanuddin</div>
          </div>
        </div>
        <nav aria-label="Navigasi utama" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-0.5 lg:overflow-visible">
          {items.map(({ key, href, Icon }) => (
            <Link key={key} href={href} className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-100 hover:bg-navy-800 hover:text-white">
              <Icon className="h-4 w-4" aria-hidden /> <span className="whitespace-nowrap">{t(lang, `nav.${key}`)}</span>
            </Link>
          ))}
        </nav>
        <div className="hidden px-5 pb-5 pt-3 text-[11px] leading-snug text-navy-200 lg:block">{t(lang, "app.tagline")}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <div data-testid="env-banner" className={`no-print px-4 py-1.5 text-center text-xs font-extrabold tracking-wide sm:px-8 ${mode === "PILOT" ? "bg-navy-950 text-white" : "bg-purple-700 text-white"}`}>
          {mode === "PILOT" ? (lang === "id" ? "LINGKUNGAN: PILOT — data nyata dan rahasia; tidak ada data demonstrasi" : "ENVIRONMENT: PILOT — real, confidential data; no demonstration data") : (lang === "id" ? "LINGKUNGAN: DEMO — seluruh data FIKTIF; bukan validasi nyata" : "ENVIRONMENT: DEMO — all data is FICTIONAL; not real validation")}
        </div>
        <header className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-8">
          <p className="text-xs text-slate-500">{t(lang, "app.advisory")}</p>
          <div className="flex items-center gap-3 text-sm">
            <form action={setLangAction}>
              <input type="hidden" name="lang" value={lang === "id" ? "en" : "id"} />
              <button className="btn-outline !px-2.5 !py-1 text-xs" type="submit">{t(lang, "lang.switch")}</button>
            </form>
            <div className="text-right leading-tight">
              <div className="font-semibold text-navy-900">{user.name}</div>
              <div className="text-xs text-slate-500">{t(lang, `role.${user.role}`)}</div>
            </div>
            <form action={logoutAction}>
              <button className="btn-outline !px-2.5 !py-1.5" type="submit" aria-label={t(lang, "nav.logout")} title={t(lang, "nav.logout")}><LogOut className="h-4 w-4" aria-hidden /></button>
            </form>
          </div>
        </header>
        {demoPolicy && (
          <div className="no-print border-b border-amber-300 bg-warn-soft px-4 py-1.5 text-center text-xs font-semibold text-warn-ink sm:px-8">{mode === "PILOT" ? "Kebijakan resmi belum dikonfigurasi — klirens resmi diblokir sampai pejabat berwenang menerbitkan kebijakan resmi." : t(lang, "app.demoPolicyBanner")}</div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
