import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireAdminFor } from "@/server/identity/access";
import type { CurrentUser } from "@/server/identity/session";
import { parseDateOnly } from "@/lib/dates";
import { PAGE_SIZE, pageOf, textParam, type Page } from "@/server/platform/validation";

const dateParam = (v: unknown, endOfDay = false): Date | undefined => {
  if (typeof v !== "string" || !v) return undefined;
  try {
    const d = parseDateOnly(v);
    return endOfDay ? new Date(d.getTime() + 86_400_000) : d;
  } catch {
    return undefined;
  }
};

export function auditWhere(user: CurrentUser, params: Record<string, unknown>): Prisma.AuditEventWhereInput {
  const q = textParam(params.q);
  const from = dateParam(params.from);
  const to = dateParam(params.to, true);
  return {
    organizationId: user.organizationId,
    ...(typeof params.objectType === "string" && params.objectType ? { objectType: params.objectType } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(q ? { OR: [{ summary: { contains: q, mode: "insensitive" } }, { actorLabel: { contains: q, mode: "insensitive" } }, { action: { contains: q, mode: "insensitive" } }] } : {}),
  };
}

export async function listAuditEvents(params: Record<string, unknown>) {
  const user = await requireAdminFor("audit.view");
  const where = auditWhere(user, params);
  const page = pageOf(params.page);
  const [total, rows, types] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditEvent.findMany({ where: { organizationId: user.organizationId }, distinct: ["objectType"], select: { objectType: true }, orderBy: { objectType: "asc" } }),
  ]);
  const result: Page<(typeof rows)[number]> = { total, page, pageSize: PAGE_SIZE, rows };
  return { ...result, objectTypes: types.map((t) => t.objectType) };
}
