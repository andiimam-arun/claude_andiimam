import { createHash } from "node:crypto";

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Normalisasi judul: huruf kecil, tanpa diakritik/tanda baca/spasi ganda, tanpa kata "the". */
export function normalizeTitle(t: string | null | undefined): string {
  if (!t) return "";
  return t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
