import type { PrismaClient } from "@prisma/client";
import { deliverMail, type MailMessage } from "@/server/platform/mail";

const MAX_ATTEMPTS = 8;

type Delivery = (payload: unknown) => Promise<void>;

const handlers: Record<string, Delivery> = {
  "email.send": async (payload) => deliverMail(payload as MailMessage),
};

/**
 * Claim a batch of due outbox rows with FOR UPDATE SKIP LOCKED so several
 * workers never deliver the same event, then deliver each one with
 * exponential backoff on failure.
 */
export async function processOutboxBatch(db: PrismaClient, batchSize = 20): Promise<number> {
  const claimed = await db.$queryRaw<{ id: string; type: string; payload: unknown; attempts: number }[]>`
    UPDATE "OutboxEvent" SET "attempts" = "attempts" + 1, "availableAt" = now() + interval '5 minutes'
    WHERE "id" IN (
      SELECT "id" FROM "OutboxEvent"
      WHERE "status" = 'PENDING' AND "availableAt" <= now()
      ORDER BY "availableAt"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "type", "payload", "attempts"`;

  for (const event of claimed) {
    const handler = handlers[event.type];
    try {
      if (!handler) throw new Error(`No handler for ${event.type}`);
      await handler(event.payload);
      await db.outboxEvent.update({ where: { id: event.id }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
      const failed = event.attempts >= MAX_ATTEMPTS;
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: failed ? "FAILED" : "PENDING",
          lastError: message,
          availableAt: new Date(Date.now() + Math.min(2 ** event.attempts, 3600) * 1000),
        },
      });
    }
  }
  return claimed.length;
}
