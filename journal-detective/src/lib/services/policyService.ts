import { prisma } from "../db";
import { DEMO_POLICY, parsePolicy } from "../engine/policy";
import type { PolicyConfig } from "../engine/types";
import { audit, type Actor } from "./audit";
import { isPilot } from "../mode";

export interface ActivePolicy { id: string; version: number; name: string; isDemo: boolean; config: PolicyConfig; createdAt: Date; note: string | null }

export async function getActivePolicy(): Promise<ActivePolicy> {
  let p = await prisma.policy.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
  if (!p) {
    p = await prisma.policy.create({
      data: { version: 1, name: isPilot() ? "Kebijakan resmi belum dikonfigurasi (placeholder sementara)" : "Kebijakan DEMONSTRASI (bukan peraturan resmi)", isDemo: true, configJson: JSON.stringify(DEMO_POLICY), active: true, createdBy: "sistem", note: isPilot() ? "Placeholder agar investigasi dapat berjalan. BUKAN peraturan fakultas. Klirens resmi diblokir sampai pejabat berwenang menerbitkan kebijakan resmi." : "Nilai awal demonstrasi. Pejabat berwenang wajib memasukkan aturan resmi fakultas." },
    });
  }
  return { id: p.id, version: p.version, name: p.name, isDemo: p.isDemo, config: parsePolicy(JSON.parse(p.configJson)), createdAt: p.createdAt, note: p.note };
}

export async function listPolicies() {
  return prisma.policy.findMany({ orderBy: { version: "desc" } });
}

/** Setiap perubahan membuat VERSI BARU (tidak menimpa) agar jejak audit utuh. */
export async function publishPolicy(actor: Actor, input: { name: string; config: unknown; isDemo: boolean; note: string }) {
  const config = parsePolicy(input.config);
  const latest = await prisma.policy.findFirst({ orderBy: { version: "desc" } });
  const version = (latest?.version ?? 0) + 1;
  await prisma.policy.updateMany({ where: { active: true }, data: { active: false } });
  const p = await prisma.policy.create({
    data: { version, name: input.name, isDemo: input.isDemo, configJson: JSON.stringify(config), note: input.note, active: true, createdBy: actor.id },
  });
  await audit(actor, "POLICY_PUBLISHED", "Policy", p.id, { version, isDemo: input.isDemo, note: input.note }, version);
  return p;
}

export async function getPolicyById(id: string): Promise<ActivePolicy> {
  const p = await prisma.policy.findUniqueOrThrow({ where: { id } });
  return { id: p.id, version: p.version, name: p.name, isDemo: p.isDemo, config: parsePolicy(JSON.parse(p.configJson)), createdAt: p.createdAt, note: p.note };
}
