// Normalisasi domain & perbandingan situs. Tanpa jaringan; hanya string.

const MULTI_PART_SUFFIXES = new Set([
  "co.id", "ac.id", "or.id", "go.id", "sch.id", "web.id", "my.id", "biz.id", "mil.id", "net.id", "desa.id",
  "co.uk", "ac.uk", "org.uk", "gov.uk", "com.au", "edu.au", "org.au", "co.jp", "ac.jp", "co.in", "ac.in",
  "com.my", "edu.my", "com.sg", "edu.sg", "co.za", "ac.za", "com.br", "edu.br", "com.tr", "edu.tr", "co.nz", "ac.nz",
  "com.cn", "edu.cn", "com.hk", "co.kr", "ac.kr", "com.pk", "edu.pk", "com.ng", "edu.ng", "com.eg", "edu.eg",
]);

export function extractHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase().replace(/\.$/, "");
    return h || null;
  } catch {
    return null;
  }
}

/** Domain terdaftar (registrable) berdasarkan daftar sufiks majemuk yang disederhanakan. */
export function registrableDomain(input: string | null | undefined): string | null {
  const h = extractHostname(input);
  if (!h) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return h; // alamat IP: apa adanya
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const last2 = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(last2)) return parts.slice(-3).join(".");
  return last2;
}

export function isIpHost(input: string | null | undefined): boolean {
  const h = extractHostname(input);
  return !!h && (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":"));
}

export function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const HOMOGLYPHS: Record<string, string> = { "0": "o", "1": "l", "3": "e", "5": "s", "rn": "m", "vv": "w" };

function skeleton(label: string): string {
  let s = label.replace(/[-_]/g, "");
  for (const [k, v] of Object.entries(HOMOGLYPHS)) s = s.split(k).join(v);
  return s;
}

export interface LookalikeResult {
  similar: boolean;
  reason?: "HOMOGLYPH" | "EDIT_DISTANCE" | "HYPHEN_VARIANT" | "SAME_LABEL_DIFFERENT_TLD" | "PUNYCODE";
  closest?: string;
}

/** Deteksi kemiripan mencurigakan antara domain yang diajukan dan domain resmi. Hanya SINYAL, bukan bukti. */
export function lookalike(submitted: string, officials: string[]): LookalikeResult {
  const s = registrableDomain(submitted);
  if (!s) return { similar: false };
  if (s.includes("xn--")) return { similar: true, reason: "PUNYCODE", closest: officials[0] };
  const sLabel = s.split(".")[0];
  for (const o of officials) {
    const od = registrableDomain(o);
    if (!od || od === s) continue;
    const oLabel = od.split(".")[0];
    if (sLabel === oLabel) return { similar: true, reason: "SAME_LABEL_DIFFERENT_TLD", closest: od };
    if (sLabel.replace(/-/g, "") === oLabel.replace(/-/g, "")) return { similar: true, reason: "HYPHEN_VARIANT", closest: od };
    if (skeleton(sLabel) === skeleton(oLabel)) return { similar: true, reason: "HOMOGLYPH", closest: od };
    const dist = levenshtein(sLabel, oLabel);
    if (dist <= 2 && Math.min(sLabel.length, oLabel.length) >= 6) return { similar: true, reason: "EDIT_DISTANCE", closest: od };
  }
  return { similar: false };
}

export type DomainRelation = "MATCH" | "DIFFERENT" | "NO_SUBMITTED" | "NO_OFFICIAL";

export function compareDomains(submitted: string | null | undefined, officials: string[]): DomainRelation {
  const s = registrableDomain(submitted);
  if (!s) return "NO_SUBMITTED";
  const os = officials.map((o) => registrableDomain(o)).filter(Boolean) as string[];
  if (os.length === 0) return "NO_OFFICIAL";
  return os.includes(s) ? "MATCH" : "DIFFERENT";
}
