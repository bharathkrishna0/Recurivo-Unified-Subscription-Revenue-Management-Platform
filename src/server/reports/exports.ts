import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireAdminFor, requirePermissionFor } from "@/server/identity/access";
import { actorOf, type CurrentUser } from "@/server/identity/session";
import { recordAudit } from "@/server/platform/audit";
import { notFound } from "@/server/platform/errors";
import { toCsv, type CsvCell } from "@/lib/csv";
import { formatDateOnly } from "@/lib/dates";
import { computeInsights, parseInsightFilters, type InsightFilters } from "./insights";
import { auditWhere } from "./audit";

export const EXPORT_KINDS = ["revenue-by-plan", "invoices", "payments", "audit"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const MAX_ROWS = 50_000;
const day = (v: Date | null) => (v ? formatDateOnly(v) : "");

async function invoicesCsv(user: CurrentUser, f: InsightFilters) {
  const where: Prisma.InvoiceWhereInput = {
    organizationId: user.organizationId,
    status: { not: "DRAFT" },
    issueDate: { gte: f.from, lte: f.to },
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.planId || f.status ? { subscription: { ...(f.planId ? { planId: f.planId } : {}), ...(f.status ? { status: f.status } : {}) } } : {}),
  };
  const rows = await db.invoice.findMany({ where, orderBy: [{ issueDate: "asc" }, { number: "asc" }], take: MAX_ROWS, include: { customer: { select: { businessName: true } }, subscription: { select: { number: true } } } });
  return toCsv(
    ["Invoice", "Customer", "Subscription", "Status", "Issued", "Due", "Currency", "Subtotal", "Discount", "Tax", "Total", "Paid", "Balance"],
    rows.map((i): CsvCell[] => [i.number, i.customer.businessName, i.subscription?.number, i.status, day(i.issueDate), day(i.dueDate), i.currency, i.subtotal.toFixed(2), i.discountTotal.toFixed(2), i.taxTotal.toFixed(2), i.total.toFixed(2), i.amountPaid.toFixed(2), i.status === "CONFIRMED" ? i.total.minus(i.amountPaid).toFixed(2) : "0.00"]),
  );
}

async function paymentsCsv(user: CurrentUser, f: InsightFilters) {
  const rows = await db.payment.findMany({
    where: { organizationId: user.organizationId, receivedOn: { gte: f.from, lte: f.to }, ...(f.customerId ? { customerId: f.customerId } : {}) },
    orderBy: [{ receivedOn: "asc" }, { number: "asc" }],
    take: MAX_ROWS,
    include: { customer: { select: { businessName: true } }, allocations: { where: { reversedAt: null }, include: { invoice: { select: { number: true } } } } },
  });
  return toCsv(
    ["Payment", "Customer", "Received on", "Method", "Reference", "Status", "Amount", "Applied to"],
    rows.map((p): CsvCell[] => [p.number, p.customer.businessName, day(p.receivedOn), p.method, p.reference, p.status, p.amount.toFixed(2), p.allocations.map((a) => `${a.invoice.number}:${a.amount.toFixed(2)}`).join("; ")]),
  );
}

async function revenueCsv(user: CurrentUser, f: InsightFilters) {
  const ins = await computeInsights(user, f);
  return toCsv(
    ["Plan", "Subscriptions", "MRR", "Billed", "Collected", "Outstanding"],
    [...ins.byPlan.map((r): CsvCell[] => [r.plan, r.subscriptions, r.mrr, r.billed, r.collected, r.outstanding]), ["Total", ins.subscriptions, ins.mrr, ins.billed, ins.collected, ins.outstanding]],
  );
}

async function auditCsv(user: CurrentUser, params: Record<string, unknown>) {
  const rows = await db.auditEvent.findMany({ where: auditWhere(user, params), orderBy: { createdAt: "asc" }, take: MAX_ROWS });
  return toCsv(["Time (UTC)", "Actor", "Action", "Object type", "Object id", "Summary"], rows.map((e): CsvCell[] => [e.createdAt.toISOString(), e.actorLabel, e.action, e.objectType, e.objectId, e.summary]));
}

/** Role-authorized, organization-scoped CSV exports; every export is audit-logged (REP-03). */
export async function exportCsv(kind: string, params: Record<string, unknown>): Promise<{ filename: string; csv: string }> {
  if (!EXPORT_KINDS.includes(kind as ExportKind)) throw notFound("Unknown export.");
  const user = kind === "audit" ? await requireAdminFor("audit.export") : await requirePermissionFor("reports.view", `export.${kind}`);
  const f = parseInsightFilters(params, user.organization.timezone);
  const csv =
    kind === "invoices" ? await invoicesCsv(user, f) : kind === "payments" ? await paymentsCsv(user, f) : kind === "revenue-by-plan" ? await revenueCsv(user, f) : await auditCsv(user, params);
  const rows = csv.split("\r\n").length - 2;
  const range = `${formatDateOnly(f.from)}_${formatDateOnly(f.to)}`;
  await recordAudit(db, actorOf(user), {
    action: "report.exported",
    objectType: "Report",
    objectId: kind,
    summary: `Exported ${kind} CSV (${rows} row${rows === 1 ? "" : "s"}${kind === "audit" ? "" : `, ${range.replace("_", " to ")}`})`,
    changes: { filters: params as Prisma.InputJsonValue },
  });
  return { filename: `recurivo-${kind}-${kind === "audit" ? formatDateOnly(new Date()) : range}.csv`, csv };
}
