import { prisma } from "../db";

export interface Actor { id: string; name: string; role?: string }

export async function audit(actor: Actor | null, action: string, entity: string, entityId?: string | null, detail: Record<string, unknown> = {}, policyVersion?: number | null) {
  await prisma.auditLog.create({
    data: {
      actorId: actor?.id ?? null, actorName: actor?.name ?? "sistem", actorRole: actor?.role ?? null,
      action, entity, entityId: entityId ?? null, detailJson: JSON.stringify(detail), policyVersion: policyVersion ?? null,
    },
  });
}
