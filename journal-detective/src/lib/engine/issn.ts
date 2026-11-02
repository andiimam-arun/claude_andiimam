/** Validasi dan normalisasi ISSN (ISO 3297) dengan digit pemeriksa modulus 11. */
export function normalizeIssn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.toUpperCase().replace(/[^0-9X]/g, "");
  if (m.length !== 8) return null;
  return `${m.slice(0, 4)}-${m.slice(4)}`;
}

export function issnCheckDigit(first7: string): string {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(first7[i]) * (8 - i);
  const r = (11 - (sum % 11)) % 11;
  return r === 10 ? "X" : String(r);
}

export function isValidIssn(raw: string | null | undefined): boolean {
  const n = normalizeIssn(raw);
  if (!n) return false;
  const d = n.replace("-", "");
  if (!/^\d{7}[\dX]$/.test(d)) return false;
  return issnCheckDigit(d.slice(0, 7)) === d[7];
}

export function withIssnCheckDigit(first7: string): string {
  const c = issnCheckDigit(first7);
  return `${first7.slice(0, 4)}-${first7.slice(4)}${c}`;
}
