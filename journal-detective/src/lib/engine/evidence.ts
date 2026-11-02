import type { CheckName, EvidenceRecord, EvidenceStatus, EvidenceStrength, IntegrationState, ReviewState, Severity } from "./types";
import { sha256 } from "./util";

export interface EvidenceInit {
  check: CheckName;
  key: string;
  finding: string;
  status: EvidenceStatus;
  integration: IntegrationState;
  sourceName: string;
  sourceUrl?: string | null;
  sourceRef?: string | null;
  retrievedAt?: string;
  sourceDataDate?: string | null;
  extracted?: string;
  explanation?: string;
  severity?: Severity;
  strength?: EvidenceStrength;
  requiresHumanConfirmation?: boolean;
  review?: ReviewState;
  data?: Record<string, any>;
  /** Penentu identitas stabil agar keputusan peninjau bertahan lintas penilaian ulang. */
  fingerprintSeed?: string;
  origin?: "AUTO" | "MANUAL";
}

/** Membangun catatan bukti dengan nilai bawaan yang konservatif. TIDAK pernah membuat sumber/tautan palsu. */
export function makeEvidence(i: EvidenceInit): EvidenceRecord {
  const seed = i.fingerprintSeed ?? `${i.sourceName}|${JSON.stringify(i.data ?? {})}`;
  return {
    check: i.check,
    key: i.key,
    finding: i.finding,
    status: i.status,
    integration: i.integration,
    sourceName: i.sourceName,
    sourceUrl: i.sourceUrl ?? null,
    sourceRef: i.sourceRef ?? null,
    retrievedAt: i.retrievedAt ?? new Date().toISOString(),
    sourceDataDate: i.sourceDataDate ?? null,
    extracted: i.extracted ?? "",
    explanation: i.explanation ?? "",
    severity: i.severity ?? "INFO",
    strength: i.strength ?? (i.status === "VERIFIED" ? "STRONG" : i.status === "REPORTED_UNVERIFIED" ? "WEAK" : "NONE"),
    requiresHumanConfirmation: i.requiresHumanConfirmation ?? false,
    review: i.review ?? (i.requiresHumanConfirmation ? "PENDING" : "NOT_REQUIRED"),
    data: i.data ?? {},
    fingerprint: sha256(`${i.check}|${i.key}|${seed}`).slice(0, 32),
    origin: i.origin ?? "AUTO",
  };
}
