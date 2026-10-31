import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { recordAudit } from "@/server/platform/audit";
import { invalid, notFound } from "@/server/platform/errors";
import { actorOf } from "@/server/identity/session";
import { requirePermissionFor } from "@/server/identity/access";

export async function listExceptions(params: { status?: unknown }) {
  const user = await requirePermissionFor("billing.manage", "exceptions.view");
  const status = params.status === "RESOLVED" ? "RESOLVED" : "OPEN";
  return db.billingException.findMany({ where: { organizationId: user.organizationId, status }, orderBy: { lastAttemptAt: "desc" }, take: 200 });
}

export async function openExceptionCount(organizationId: string): Promise<number> {
  return db.billingException.count({ where: { organizationId, status: "OPEN" } });
}

export async function resolveException(id: string, resolution: unknown): Promise<void> {
  const user = await requirePermissionFor("billing.manage", "exception.resolve");
  const parsed = z.string().trim().min(3, "Describe what was done").max(500).safeParse(resolution);
  if (!parsed.success) throw invalid("Check the highlighted fields.", { resolution: parsed.error.issues[0].message });
  await db.$transaction(async (tx) => {
    const ex = await tx.billingException.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!ex) throw notFound("Exception not found.");
    await tx.billingException.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: user.id, resolution: parsed.data } });
    await recordAudit(tx, actorOf(user), { action: "exception.resolved", objectType: "BillingException", objectId: id, summary: `Resolved: ${ex.summary} (${parsed.data})` });
  });
}
