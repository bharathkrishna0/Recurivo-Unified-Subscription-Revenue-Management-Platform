import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { recordAudit } from "@/server/platform/audit";
import { invalid, notFound } from "@/server/platform/errors";
import { parseOrThrow } from "@/server/identity/service";
import { actorOf, requireStaff } from "@/server/identity/session";
import { requirePermissionFor } from "@/server/identity/access";
import { optional, wholeNumber } from "@/server/platform/validation";
import { linesSchema, resolveLines } from "./lines";

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Enter a template name").max(120),
  planId: z.string().min(1, "Choose a plan"),
  validityDays: wholeNumber(1, "Validity must be a whole number of days, at least 1").pipe(z.number().max(365, "Validity can be at most 365 days")),
  paymentTermsDays: optional(wholeNumber(0, "Payment terms must be a whole number of days").pipe(z.number().max(365, "Payment terms can be at most 365 days"))),
  terms: optional(z.string().trim().max(4000)),
  lines: linesSchema,
});

export async function listTemplates(params: { status?: unknown } = {}) {
  const user = await requireStaff();
  const status = params.status === "ARCHIVED" ? "ARCHIVED" : params.status === "all" ? undefined : "ACTIVE";
  return db.quotationTemplate.findMany({
    where: { organizationId: user.organizationId, ...(status ? { status } : {}) },
    orderBy: { name: "asc" },
    include: { plan: { select: { name: true, interval: true } }, _count: { select: { lines: true, subscriptions: true } } },
  });
}

export async function getTemplate(id: string) {
  const user = await requireStaff();
  const template = await db.quotationTemplate.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { plan: true, lines: { orderBy: { position: "asc" }, include: { product: true, variant: true } } },
  });
  if (!template) throw notFound("Template not found.");
  return template;
}

export async function saveTemplate(id: string | null, input: unknown): Promise<{ id: string }> {
  const user = await requirePermissionFor("catalog.write", id ? "template.update" : "template.create");
  const data = parseOrThrow(templateSchema, input);
  return db.$transaction(async (tx) => {
    const plan = await tx.plan.findFirst({ where: { id: data.planId, organizationId: user.organizationId } });
    if (!plan || plan.status !== "ACTIVE") throw invalid("Check the highlighted fields.", { planId: "Choose an active plan" });
    await resolveLines(tx, user.organizationId, plan, data.lines, user.organization.currency);
    const fields = {
      name: data.name,
      planId: data.planId,
      validityDays: data.validityDays,
      paymentTermsDays: data.paymentTermsDays ?? null,
      terms: data.terms ?? null,
    };
    const lines = data.lines.map((l, position) => ({ productId: l.productId, variantId: l.variantId ?? null, quantity: l.quantity, position }));
    let templateId: string;
    if (id) {
      const existing = await tx.quotationTemplate.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!existing) throw notFound("Template not found.");
      await tx.quotationTemplateLine.deleteMany({ where: { templateId: id } });
      await tx.quotationTemplate.update({ where: { id }, data: { ...fields, lines: { create: lines } } });
      templateId = id;
    } else {
      templateId = (await tx.quotationTemplate.create({ data: { ...fields, organizationId: user.organizationId, lines: { create: lines } } })).id;
    }
    await recordAudit(tx, actorOf(user), {
      action: id ? "template.updated" : "template.created",
      objectType: "QuotationTemplate",
      objectId: templateId,
      summary: `${id ? "Updated" : "Created"} quotation template ${data.name}`,
    });
    return { id: templateId };
  });
}

export async function setTemplateStatus(id: string, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  const user = await requirePermissionFor("catalog.write", "template.archive");
  await db.$transaction(async (tx) => {
    const t = await tx.quotationTemplate.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!t) throw notFound("Template not found.");
    await tx.quotationTemplate.update({ where: { id }, data: { status } });
    await recordAudit(tx, actorOf(user), {
      action: status === "ARCHIVED" ? "template.archived" : "template.restored",
      objectType: "QuotationTemplate",
      objectId: id,
      summary: `${status === "ARCHIVED" ? "Archived" : "Restored"} quotation template ${t.name}`,
    });
  });
}
