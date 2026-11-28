import { prisma } from "../db";
import { saveSetting } from "../services/settings";
import { purgeApplicationDocuments } from "../services/documents";
import type { Actor } from "../services/audit";

export interface Retention { documentRetentionDays: number | null }
export async function getRetention(): Promise<Retention> {
  const s = await prisma.setting.findUnique({ where: { key: "retention" } });
  try { return s ? (JSON.parse(s.valueJson) as Retention) : { documentRetentionDays: null }; } catch { return { documentRetentionDays: null }; }
}
export async function setRetention(days: number | null, actor: Actor) {
  if (days !== null && (!Number.isInteger(days) || days < 30 || days > 3650)) throw new Error("Masa retensi harus 30–3650 hari atau kosong (tanpa batas otomatis).");
  await saveSetting("retention", { documentRetentionDays: days });
  const { audit } = await import("../services/audit");
  await audit(actor, "RETENTION_SET", "Setting", "retention", { days });
}

/** Dokumen pada permohonan FINAL yang telah melewati masa retensi. Hanya melaporkan; penghapusan butuh tindakan eksplisit operator. */
export async function findExpiredDocuments(days: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  return prisma.application.findMany({ where: { workflow: { in: ["APPROVED", "REJECTED"] }, decidedAt: { lt: cutoff }, documents: { some: {} } }, select: { id: true, refNumber: true, decidedAt: true, _count: { select: { documents: true } } } });
}
export async function purgeExpired(days: number, actor: Actor) {
  const apps = await findExpiredDocuments(days);
  for (const a of apps) await purgeApplicationDocuments(a.id, actor, `Retensi ${days} hari terlampaui`);
  return apps.length;
}
