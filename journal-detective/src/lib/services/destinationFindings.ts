import { prisma } from "../db";
import { normalizeDestination } from "../engine/domain";
import { audit, type Actor } from "./audit";
import { getMode } from "../mode";
import type { ActiveFinding } from "./hijack";

export type FindingStatus = "CLONE_CONFIRMED" | "AUTHENTIC_VERIFIED" | "MIGRATION_VERIFIED" | "PLATFORM_VERIFIED";
export const FINDING_STATUSES: FindingStatus[] = ["CLONE_CONFIRMED", "AUTHENTIC_VERIFIED", "MIGRATION_VERIFIED", "PLATFORM_VERIFIED"];

export class FindingError extends Error {}

/** Semua baris (riwayat lengkap) untuk satu jurnal, terbaru dahulu. */
export async function findingHistory(journalId: string) {
  return prisma.destinationFinding.findMany({ where: { journalId }, orderBy: { createdAt: "desc" } });
}

/** Temuan AKTIF per host: baris terbaru per host; jika baris terbaru RETRACTED maka tidak ada temuan aktif (host dicatat sebagai 'dikoreksi'). */
export async function activeFindings(journalId: string): Promise<{ active: ActiveFinding[]; retractedHosts: Set<string> }> {
  const rows = await prisma.destinationFinding.findMany({ where: { journalId }, orderBy: { createdAt: "asc" } });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) latest.set(r.host, r);
  const everRetracted = new Set<string>(rows.filter((r) => r.status === "RETRACTED").map((r) => r.host));
  const active: ActiveFinding[] = [];
  const retractedHosts = new Set<string>();
  for (const [host, r] of latest) {
    if (r.status === "RETRACTED") { retractedHosts.add(host); continue; }
    active.push({
      id: r.id, host, status: r.status as FindingStatus, basis: r.basis, sourceName: r.sourceName, sourceUrl: r.sourceUrl, sourceRef: r.sourceRef, sourceDataDate: r.sourceDataDate,
      includeSubdomains: r.includeSubdomains, createdByName: r.createdByName, createdAt: r.createdAt.toISOString(), evidenceFingerprint: r.evidenceFingerprint, isDemo: r.isDemo,
    });
  }
  void everRetracted;
  return { active, retractedHosts };
}

export interface RecordFindingInput {
  journalId: string; urlOrHost: string; status: FindingStatus; basis: string; sourceName: string; sourceUrl?: string | null; sourceRef?: string | null;
  sourceDataDate?: string | null; evidenceFingerprint?: string | null; includeSubdomains?: boolean; actor: Actor;
}

/** Mencatat temuan tujuan permanen. Konflik dengan temuan aktif yang berbeda ditolak: harus melalui koreksi terdokumentasi. */
export async function recordFinding(i: RecordFindingInput) {
  const n = normalizeDestination(i.urlOrHost);
  if (!n.ok || !n.host) throw new FindingError("Host tujuan tidak valid");
  if (!FINDING_STATUSES.includes(i.status)) throw new FindingError("Status temuan tidak valid");
  if (i.basis.trim().length < 10) throw new FindingError("Dasar temuan minimal 10 karakter");
  if (!i.sourceName.trim()) throw new FindingError("Nama sumber wajib diisi");
  if (!(i.sourceUrl?.trim() || i.sourceRef?.trim() || i.evidenceFingerprint)) throw new FindingError("Temuan wajib memuat URL sumber, referensi dokumen, atau bukti terkait (asal-usul)");
  if (i.sourceUrl && !/^https?:\/\//i.test(i.sourceUrl)) throw new FindingError("URL sumber harus diawali http(s)://");
  const { active } = await activeFindings(i.journalId);
  const cur = active.find((f) => f.host === n.host);
  if (cur) {
    if (cur.status === i.status) return prisma.destinationFinding.findUniqueOrThrow({ where: { id: cur.id } });
    throw new FindingError(`Sudah ada temuan aktif ${cur.status} untuk host ${n.host}. Gunakan proses KOREKSI terdokumentasi sebelum mencatat temuan yang bertentangan.`);
  }
  const row = await prisma.destinationFinding.create({
    data: {
      journalId: i.journalId, host: n.host, registrableDomain: n.registrable ?? n.host, status: i.status, basis: i.basis.trim(), sourceName: i.sourceName.trim(),
      sourceUrl: i.sourceUrl?.trim() || null, sourceRef: i.sourceRef?.trim() || null, sourceDataDate: i.sourceDataDate || null, evidenceFingerprint: i.evidenceFingerprint ?? null,
      includeSubdomains: !!i.includeSubdomains, isDemo: getMode() === "DEMO", createdById: i.actor.id, createdByName: i.actor.name,
    },
  });
  await audit(i.actor, "DESTINATION_FINDING_RECORDED", "DestinationFinding", row.id, { journalId: i.journalId, host: n.host, status: i.status, basis: i.basis });
  return row;
}

/**
 * Koreksi terkontrol atas temuan keliru: hanya REVIEWER/HEAD, wajib rasional ≥ 20 karakter dan bukti pendukung (URL atau referensi).
 * Membuat baris RETRACTED baru; baris asli TIDAK dihapus. Bila temuan berasal dari konfirmasi bukti, tinjauan bukti ditolak untuk
 * mencegah status klon kembali dari tinjauan lama.
 */
export async function retractFinding(opts: { findingId: string; rationale: string; sourceUrl?: string | null; sourceRef?: string | null; actor: Actor & { role?: string } }) {
  if (!["REVIEWER", "HEAD"].includes(opts.actor.role ?? "")) throw new FindingError("Hanya peninjau atau Kepala Unit yang dapat mengoreksi temuan tujuan.");
  if (opts.rationale.trim().length < 20) throw new FindingError("Rasional koreksi minimal 20 karakter.");
  if (!(opts.sourceUrl?.trim() || opts.sourceRef?.trim())) throw new FindingError("Koreksi wajib menyertakan bukti pendukung (URL atau referensi dokumen).");
  if (opts.sourceUrl && !/^https?:\/\//i.test(opts.sourceUrl)) throw new FindingError("URL bukti harus diawali http(s)://");
  const target = await prisma.destinationFinding.findUniqueOrThrow({ where: { id: opts.findingId } });
  const { active } = await activeFindings(target.journalId);
  if (!active.some((f) => f.id === target.id)) throw new FindingError("Temuan ini bukan temuan aktif (sudah dikoreksi/digantikan).");
  const row = await prisma.destinationFinding.create({
    data: {
      journalId: target.journalId, host: target.host, registrableDomain: target.registrableDomain, status: "RETRACTED", retractsId: target.id,
      basis: opts.rationale.trim(), sourceName: "Koreksi temuan", sourceUrl: opts.sourceUrl?.trim() || null, sourceRef: opts.sourceRef?.trim() || null,
      evidenceFingerprint: target.evidenceFingerprint, isDemo: target.isDemo, createdById: opts.actor.id, createdByName: opts.actor.name,
    },
  });
  if (target.evidenceFingerprint) {
    await prisma.evidenceReview.create({
      data: { journalId: target.journalId, fingerprint: target.evidenceFingerprint, decision: "DISMISSED", note: `Dikoreksi: ${opts.rationale.trim()}`, reviewerId: opts.actor.id, reviewerName: opts.actor.name },
    });
  }
  await audit(opts.actor, "DESTINATION_FINDING_RETRACTED", "DestinationFinding", row.id, { retracts: target.id, host: target.host, previousStatus: target.status, rationale: opts.rationale }, null);
  return row;
}
