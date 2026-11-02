import "server-only";
import { redirect } from "next/navigation";

export function go(path: string, flash?: { notice?: string; error?: string }): never {
  const u = new URL(path, "http://x");
  if (flash?.notice) u.searchParams.set("notice", flash.notice);
  if (flash?.error) u.searchParams.set("error", flash.error);
  redirect(u.pathname + u.search + u.hash);
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const optStr = (f: FormData, k: string) => (str(f, k) || null);

export function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "digest" in e && String((e as any).digest).startsWith("NEXT_REDIRECT")) throw e;
  if (e && typeof e === "object" && "issues" in e) return (e as any).issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return e instanceof Error ? e.message : "Terjadi kesalahan";
}
