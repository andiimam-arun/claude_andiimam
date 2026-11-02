import { CheckCircle2, AlertTriangle, XOctagon, Info, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const STYLE = {
  GREEN: { cls: "border-green-300 bg-ok-soft text-ok-ink", Icon: CheckCircle2 },
  YELLOW: { cls: "border-amber-300 bg-warn-soft text-warn-ink", Icon: AlertTriangle },
  RED: { cls: "border-red-300 bg-bad-soft text-bad-ink", Icon: XOctagon },
  INFO: { cls: "border-slate-300 bg-slate-100 text-slate-700", Icon: Info },
  NONE: { cls: "border-slate-300 bg-slate-50 text-slate-600", Icon: HelpCircle },
} as const;

/** Status selalu memakai ikon + teks (tidak bergantung pada warna saja). */
export function StatusBadge({ status, lang, long, className }: { status: "GREEN" | "YELLOW" | "RED" | "INFO" | "NONE"; lang: Lang; long?: boolean; className?: string }) {
  const s = STYLE[status];
  const label = status === "INFO" ? "INFO" : status === "NONE" ? "—" : t(lang, `status.${status}`) + (long ? ` · ${t(lang, `status.${status}.long`)}` : "");
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold", s.cls, className)}>
      <s.Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </span>
  );
}

export function Pill({ children, tone = "slate", className }: { children: React.ReactNode; tone?: "slate" | "navy" | "green" | "amber" | "red"; className?: string }) {
  const c = { slate: "bg-slate-100 text-slate-700 border-slate-200", navy: "bg-navy-50 text-navy-800 border-navy-200", green: "bg-ok-soft text-ok-ink border-green-200", amber: "bg-warn-soft text-warn-ink border-amber-200", red: "bg-bad-soft text-bad-ink border-red-200" }[tone];
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", c, className)}>{children}</span>;
}

/** Kartu lampu lalu lintas besar. */
export function TrafficCard({ title, status, headline, detail, lang }: { title: string; status: "GREEN" | "YELLOW" | "RED"; headline: string; detail?: string; lang: Lang }) {
  const bg = { GREEN: "border-green-400 bg-ok-soft", YELLOW: "border-amber-400 bg-warn-soft", RED: "border-red-400 bg-bad-soft" }[status];
  return (
    <div className={cn("rounded-xl border-2 p-4", bg)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <div className="mt-2 flex items-center gap-2"><StatusBadge status={status} lang={lang} /></div>
      <div className="mt-2 text-base font-bold text-slate-900">{headline}</div>
      {detail && <div className="mt-1 text-xs text-slate-700">{detail}</div>}
    </div>
  );
}
