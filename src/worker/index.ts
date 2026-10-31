import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { processOutboxBatch } from "./outbox";

const db = new PrismaClient();
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
let stopping = false;

async function tick(): Promise<void> {
  const delivered = await processOutboxBatch(db);
  if (delivered > 0) console.log(`[worker] processed ${delivered} outbox event(s)`);
}

async function main(): Promise<void> {
  console.log(`[worker] started, polling every ${INTERVAL_MS}ms`);
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      console.error("[worker] tick failed:", error instanceof Error ? error.message : error);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await db.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void main();
