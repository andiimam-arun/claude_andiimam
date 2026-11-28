import type { TrafficLight } from "./types";

/** Versi mesin keputusan; dicatat pada setiap proses validasi agar hasil dapat dikaitkan dengan versi aturan. */
export const ENGINE_VERSION = "1B.1";

export const VALIDATION_CATEGORIES = [
  { code: "GENUINE_VERIFIED", id: "Jurnal sah, indeksasi terverifikasi, situs otentik", en: "Genuine journal, verified indexing, authentic website" },
  { code: "GENUINE_INCOMPLETE_ACCEPTANCE", id: "Jurnal sah dengan bukti penerimaan tidak lengkap", en: "Genuine journal with incomplete acceptance evidence" },
  { code: "CONFIRMED_CLONE", id: "Situs klon terkonfirmasi", en: "Confirmed cloned website" },
  { code: "DISCONTINUED_INDEXING", id: "Indeksasi dihentikan pada kebijakan yang mewajibkan cakupan aktif", en: "Discontinued indexing under a policy requiring current coverage" },
  { code: "HISTORICAL_BEALL", id: "Kecocokan Beall historis tanpa pelanggaran terkini yang terkorroborasi", en: "Historical Beall's List match without corroborated current misconduct" },
  { code: "UNAVAILABLE_INDEXING", id: "Bukti indeksasi tidak tersedia", en: "Unavailable indexing evidence" },
  { code: "ACCEPTANCE_NO_REVISION", id: "Penerimaan sah tanpa putaran revisi", en: "Legitimate acceptance without a revision round" },
  { code: "ACCEPTANCE_CLONED_DESTINATION", id: "Dokumen penerimaan terverifikasi untuk tujuan klon", en: "Verified acceptance document associated with a cloned destination" },
  { code: "MIGRATION_OR_PLATFORM", id: "Migrasi domain sah atau platform pengiriman eksternal", en: "Authorized domain migration or external submission platform" },
  { code: "CONFLICTING_OR_OUTDATED", id: "Bukti sumber bertentangan atau kedaluwarsa", en: "Conflicting or outdated source evidence" },
] as const;
export type ValidationCategory = (typeof VALIDATION_CATEGORIES)[number]["code"];

export type RefStatus = TrafficLight | "NOT_ASSESSED";
export type GenStatus = TrafficLight | "NOT_EVALUATED";
export const DIMENSIONS = ["journal", "destination", "admin", "final"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const SEV: Record<TrafficLight, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

export interface DimensionComparison {
  reference: RefStatus; generated: GenStatus;
  result: "AGREE" | "DISAGREE" | "NOT_COMPARED";
  /** Aplikasi LEBIH LONGGAR daripada referensi manual = berpotensi tidak aman. */
  direction: "SAME" | "APP_MORE_PERMISSIVE" | "APP_MORE_CONSERVATIVE" | "NOT_COMPARED";
}

export function compareDimension(reference: RefStatus, generated: GenStatus): DimensionComparison {
  if (reference === "NOT_ASSESSED" || generated === "NOT_EVALUATED") return { reference, generated, result: "NOT_COMPARED", direction: "NOT_COMPARED" };
  if (reference === generated) return { reference, generated, result: "AGREE", direction: "SAME" };
  return { reference, generated, result: "DISAGREE", direction: SEV[generated] < SEV[reference] ? "APP_MORE_PERMISSIVE" : "APP_MORE_CONSERVATIVE" };
}

export interface ComparisonSummary {
  dims: Record<Dimension, DimensionComparison>;
  agreement: "AGREE" | "DISAGREE" | "NOT_COMPARED";
  /** True bila aplikasi lebih longgar pada dimensi tujuan/akhir (mis. tujuan klon mendapat HIJAU) — cacat penghalang pilot. */
  safetyCritical: boolean;
}

export function compareAll(ref: Record<Dimension, RefStatus>, gen: Record<Dimension, GenStatus>): ComparisonSummary {
  const dims = Object.fromEntries(DIMENSIONS.map((d) => [d, compareDimension(ref[d], gen[d])])) as Record<Dimension, DimensionComparison>;
  const compared = Object.values(dims).filter((d) => d.result !== "NOT_COMPARED");
  const agreement = compared.length === 0 ? "NOT_COMPARED" : compared.every((d) => d.result === "AGREE") ? "AGREE" : "DISAGREE";
  const safetyCritical = (["destination", "final", "journal"] as Dimension[]).some((d) => dims[d].direction === "APP_MORE_PERMISSIVE" && dims[d].reference === "RED");
  return { dims, agreement, safetyCritical };
}

export const DISCREPANCY_CLASSES = [
  { code: "APP_TOO_PERMISSIVE", id: "Aplikasi terlalu longgar (potensi tidak aman)", en: "Application too permissive (potentially unsafe)" },
  { code: "APP_TOO_CONSERVATIVE", id: "Aplikasi terlalu ketat", en: "Application too conservative" },
  { code: "EVIDENCE_GAP", id: "Bukti belum dimasukkan/tersedia pada sistem", en: "Evidence not yet entered/available in the system" },
  { code: "SOURCE_CONFLICT", id: "Sumber bertentangan/kedaluwarsa", en: "Conflicting/outdated sources" },
  { code: "RULE_DEFECT", id: "Cacat aturan keputusan", en: "Decision-rule defect" },
  { code: "POLICY_DIFFERENCE", id: "Perbedaan tafsir kebijakan", en: "Policy interpretation difference" },
  { code: "REFERENCE_ERROR", id: "Kesalahan pada penilaian referensi manual", en: "Error in the manual reference assessment" },
  { code: "OTHER", id: "Lainnya", en: "Other" },
] as const;
export type DiscrepancyClass = (typeof DISCREPANCY_CLASSES)[number]["code"];
