import type { Prisma } from "@prisma/client";
import type { Tx } from "@/server/db";

/** Write a side-effect request in the same transaction as the business change. */
export async function enqueueOutbox(tx: Tx, type: string, dedupeKey: string, payload: Prisma.InputJsonValue): Promise<void> {
  await tx.outboxEvent.upsert({
    where: { dedupeKey },
    create: { type, dedupeKey, payload },
    update: {},
  });
}
