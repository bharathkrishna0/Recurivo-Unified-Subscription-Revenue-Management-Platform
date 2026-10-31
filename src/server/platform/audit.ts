import type { Prisma } from "@prisma/client";
import type { Tx } from "@/server/db";

export interface AuditActor {
  id: string | null;
  label: string;
  organizationId: string;
}

export async function recordAudit(
  tx: Tx,
  actor: AuditActor,
  event: { action: string; objectType: string; objectId: string; summary: string; changes?: Prisma.InputJsonValue },
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      action: event.action,
      objectType: event.objectType,
      objectId: event.objectId,
      summary: event.summary,
      changes: event.changes,
    },
  });
}
