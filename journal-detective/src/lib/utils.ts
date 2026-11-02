import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return "—";
  const s = x.toISOString();
  return withTime ? `${s.slice(0, 10)} ${s.slice(11, 16)} UTC` : s.slice(0, 10);
}
