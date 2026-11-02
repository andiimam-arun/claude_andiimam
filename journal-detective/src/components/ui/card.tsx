import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("card", className)}>{children}</section>;
}
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <div>
        <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export const CardBody = ({ className, children }: { className?: string; children: ReactNode }) => <div className={cn("p-5", className)}>{children}</div>;

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-navy-950">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "error" | "info" | "warn"; children: ReactNode }) {
  const c = { ok: "border-green-300 bg-ok-soft text-ok-ink", error: "border-red-300 bg-bad-soft text-bad-ink", warn: "border-amber-300 bg-warn-soft text-warn-ink", info: "border-navy-200 bg-navy-50 text-navy-900" }[kind];
  return <div role={kind === "error" ? "alert" : "status"} className={cn("mb-4 rounded-lg border px-4 py-2.5 text-sm", c)}>{children}</div>;
}
