import { daysBetween } from "./util";

export interface TimelineEvent {
  type: string;
  occurredAt: Date;
}

export interface DetectedFlag {
  code: string;
  message: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH";
}

const ORDER = ["SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED", "REVISION_SUBMITTED", "ACCEPTED", "PAYMENT_REQUESTED", "PUBLISHED"];

/**
 * Deteksi anomali proses editorial. Semua hasil adalah TANDA PENINJAUAN KONTEKSTUAL, bukan bukti pelanggaran.
 * Putaran revisi TIDAK wajib: naskah yang diterima tanpa revisi tidak ditandai.
 */
export function detectProcessAnomalies(events: TimelineEvent[], fastAcceptanceWarnDays: number, now = new Date()): DetectedFlag[] {
  const flags: DetectedFlag[] = [];
  const first = (t: string) => events.filter((e) => e.type === t).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0];

  for (const e of events) {
    if (e.occurredAt.getTime() > now.getTime() + 86_400_000) {
      flags.push({ code: "event_in_future", severity: "MEDIUM", message: `Peristiwa ${e.type} bertanggal di masa depan (${e.occurredAt.toISOString().slice(0, 10)}).` });
    }
  }
  // Urutan logis antar peristiwa (hanya bila keduanya ada)
  for (let i = 0; i < ORDER.length; i++) {
    for (let j = i + 1; j < ORDER.length; j++) {
      const a = first(ORDER[i]);
      const b = first(ORDER[j]);
      if (a && b && b.occurredAt.getTime() < a.occurredAt.getTime() && !(ORDER[i] === "REVISION_REQUESTED" && ORDER[j] === "UNDER_REVIEW")) {
        flags.push({ code: "event_order", severity: "MEDIUM", message: `${ORDER[j]} (${b.occurredAt.toISOString().slice(0, 10)}) tercatat sebelum ${ORDER[i]} (${a.occurredAt.toISOString().slice(0, 10)}).` });
      }
    }
  }
  const sub = first("SUBMITTED");
  const acc = first("ACCEPTED");
  if (sub && acc && acc.occurredAt.getTime() >= sub.occurredAt.getTime()) {
    const d = daysBetween(sub.occurredAt, acc.occurredAt);
    if (d < fastAcceptanceWarnDays) {
      flags.push({
        code: "fast_acceptance",
        severity: "LOW",
        message: `Penerimaan ${d} hari setelah pengiriman — peringatan kontekstual; beberapa jurnal sah memang cepat. Periksa riwayat editorial.`,
      });
    }
  }
  return flags;
}
