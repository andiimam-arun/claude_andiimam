import { id, en, type Lang } from "./dict";
import type { Reason } from "../engine/types";

export type { Lang };
export const LANGS: Lang[] = ["id", "en"];

export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const raw = (lang === "en" ? en[key] : id[key]) ?? id[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`));
}

/** Teks alasan keputusan; kode alasan dapat berasal dari mesin jurnal, administratif, atau akhir. */
export function reasonText(lang: Lang, r: Reason): string {
  for (const ns of ["reason", "admin", "final"]) {
    const key = `${ns}.${r.code}`;
    if (id[key]) return t(lang, key, r.params);
  }
  return r.code;
}

export function actionText(lang: Lang, a: { code: string; params?: Record<string, string | number> }): string {
  return t(lang, `action.${a.code}`, a.params);
}

export function parseLang(v: string | undefined | null): Lang {
  return v === "en" ? "en" : "id";
}
