import type { Tx } from "@/server/db";

/**
 * Next organization-scoped document number (SUB-00001, INV-00001...). The
 * upsert row-locks the counter until the surrounding transaction ends, so
 * numbers are unique and gap-free across concurrent requests.
 */
export async function nextNumber(tx: Tx, organizationId: string, prefix: string): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" ("organizationId", "key", "value") VALUES (${organizationId}, ${prefix}, 1)
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = "Sequence"."value" + 1
    RETURNING "value"`;
  return `${prefix}-${String(rows[0].value).padStart(5, "0")}`;
}
