import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/server/db";
import { can } from "@/lib/permissions";
import { addDays, compareDates, todayIn } from "@/lib/dates";
import { availableActions, checkTransition, isQuoteExpired, nextBillDateOnOrAfter, termEndDate, type LifecycleAction } from "@/lib/lifecycle";
import { discountState, isPlanSellable, taxRuleInEffect } from "@/lib/pricing";
import { priceQuote } from "@/lib/quote-pricing";
import { formatMoney } from "@/lib/formatting";
import { recordAudit } from "@/server/platform/audit";
import { enqueueOutbox } from "@/server/platform/outbox";
import { AppError, invalid, notFound } from "@/server/platform/errors";
import { nextNumber } from "@/server/platform/sequence";
import { parseOrThrow } from "@/server/identity/service";
import { actorOf, requireStaff, type CurrentUser } from "@/server/identity/session";
import { dateOnly, optional, PAGE_SIZE, pageOf, textParam, wholeNumber, type Page } from "@/server/platform/validation";
import { linesSchema, resolveLines, type LineInput } from "./lines";

export const quoteSchema = z
  .object({
    customerId: z.string().min(1, "Choose a customer"),
    planId: z.string().min(1, "Choose a plan"),
    templateId: optional(z.string()),
    discountRuleId: optional(z.string()),
    startDate: dateOnly("Enter a start date"),
    endDate: optional(dateOnly("Enter a valid end date")),
    paymentTermsDays: optional(wholeNumber(0, "Payment terms must be a whole number of days").pipe(z.number().max(365, "Payment terms can be at most 365 days"))),
    terms: optional(z.string().trim().max(4000)),
    lines: linesSchema,
    expectedVersion: optional(z.coerce.number().int()),
  })
  .refine((q) => !q.endDate || compareDates(q.endDate, q.startDate) >= 0, { path: ["endDate"], message: "End date must be on or after the start date" });

export type QuoteInput = z.input<typeof quoteSchema>;

/** Staff without `subscriptions.all` only see the quotations and subscriptions they own. */
function visibleTo(user: CurrentUser): Prisma.SubscriptionWhereInput {
  return { organizationId: user.organizationId, ...(can(user, "subscriptions.all") ? {} : { ownerId: user.id }) };
}

const today = (user: CurrentUser) => todayIn(user.organization.timezone);

interface Priced {
  lines: Prisma.SubscriptionLineCreateWithoutSubscriptionInput[];
  totals: { subtotal: string; discountTotal: string; taxTotal: string; total: string };
}

async function priceQuotation(
  tx: Tx,
  user: CurrentUser,
  plan: { productId: string; price: { toString(): string }; minQuantity: number },
  data: { lines: LineInput[]; startDate: Date; discountRuleId?: string | null },
): Promise<Priced> {
  const currency = user.organization.currency;
  const resolved = await resolveLines(tx, user.organizationId, plan, data.lines, currency);
  const planQty = resolved.filter((l) => l.productId === plan.productId).reduce((n, l) => n + l.quantity, 0);
  if (planQty < plan.minQuantity) {
    const first = resolved.findIndex((l) => l.productId === plan.productId);
    throw invalid(`This plan needs a quantity of at least ${plan.minQuantity} for its product.`, {
      [`lines.${first < 0 ? 0 : first}.quantity`]: `At least ${plan.minQuantity} for this plan`,
    });
  }
  const taxes = (
    await tx.taxRule.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE" }, include: { products: { select: { id: true } } } })
  ).filter((t) => taxRuleInEffect(t, data.startDate));
  let discount = null;
  if (data.discountRuleId) {
    const rule = await tx.discountRule.findFirst({ where: { id: data.discountRuleId, organizationId: user.organizationId } });
    if (!rule || discountState(rule, today(user)) !== "ACTIVE") throw invalid("Check the highlighted fields.", { discountRuleId: "This discount is not available" });
    discount = { ...rule, type: rule.type, scope: rule.scope };
  }
  const q = priceQuote(
    resolved.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
    { taxes: taxes.map((t) => ({ ...t, productIds: t.products.map((p) => p.id) })), discount, currency },
  );
  if (q.discountNotApplied) throw invalid("Check the highlighted fields.", { discountRuleId: q.discountNotApplied });
  return {
    lines: resolved.map((l, i) => {
      const p = q.lines[i];
      return {
        product: { connect: { id: l.productId } },
        ...(l.variantId ? { variant: { connect: { id: l.variantId } } } : {}),
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineSubtotal: p.lineSubtotal.toFixed(4),
        discountAmount: p.discountAmount.toFixed(4),
        taxableAmount: p.taxableAmount.toFixed(4),
        taxRate: p.taxRate.toFixed(4),
        taxAmount: p.taxAmount.toFixed(4),
        total: p.total.toFixed(4),
        taxBreakdown: p.taxBreakdown as unknown as Prisma.InputJsonValue,
        position: i,
      };
    }),
    totals: { subtotal: q.subtotal.toFixed(4), discountTotal: q.discountTotal.toFixed(4), taxTotal: q.taxTotal.toFixed(4), total: q.total.toFixed(4) },
  };
}

async function loadQuoteRefs(tx: Tx, user: CurrentUser, data: z.infer<typeof quoteSchema>, requireSellable: boolean) {
  const [org, customer, plan, template] = await Promise.all([
    tx.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { paymentTermsDays: true } }),
    tx.customer.findFirst({ where: { id: data.customerId, organizationId: user.organizationId, archivedAt: null } }),
    tx.plan.findFirst({ where: { id: data.planId, organizationId: user.organizationId }, include: { product: true } }),
    data.templateId ? tx.quotationTemplate.findFirst({ where: { id: data.templateId, organizationId: user.organizationId } }) : null,
  ]);
  const errors: Record<string, string> = {};
  if (!customer) errors.customerId = "Choose a customer";
  if (!plan) errors.planId = "Choose a plan";
  else if (requireSellable && (!isPlanSellable(plan, today(user)) || plan.product.status !== "ACTIVE")) errors.planId = "This plan is not available for sale today";
  if (data.templateId && !template) errors.templateId = "Choose a template";
  if (Object.keys(errors).length) throw invalid("Check the highlighted fields.", errors);
  const endDate = plan!.termLength ? termEndDate(data.startDate, plan!.interval, plan!.termLength) : (data.endDate ?? null);
  const paymentTermsDays = data.paymentTermsDays ?? template?.paymentTermsDays ?? org.paymentTermsDays;
  return { customer: customer!, plan: plan!, template, endDate, paymentTermsDays };
}

/** Preview the server-side price of a quotation without saving it. */
export async function previewQuotation(input: unknown) {
  const user = await requireStaff();
  const data = parseOrThrow(quoteSchema, input);
  return db.$transaction(async (tx) => {
    const { plan } = await loadQuoteRefs(tx, user, data, true);
    return priceQuotation(tx, user, plan, data);
  });
}

export async function createQuotation(input: unknown): Promise<{ id: string; number: string }> {
  const user = await requireStaff();
  const data = parseOrThrow(quoteSchema, input);
  return db.$transaction(async (tx) => {
    const refs = await loadQuoteRefs(tx, user, data, true);
    const priced = await priceQuotation(tx, user, refs.plan, data);
    const number = await nextNumber(tx, user.organizationId, "SUB");
    const sub = await tx.subscription.create({
      data: {
        organizationId: user.organizationId,
        number,
        customerId: refs.customer.id,
        planId: refs.plan.id,
        templateId: refs.template?.id ?? null,
        ownerId: user.id,
        discountRuleId: data.discountRuleId ?? null,
        startDate: data.startDate,
        endDate: refs.endDate,
        paymentTermsDays: refs.paymentTermsDays,
        terms: data.terms ?? refs.template?.terms ?? null,
        ...priced.totals,
        lines: { create: priced.lines },
      },
    });
    await recordAudit(tx, actorOf(user), {
      action: "subscription.drafted",
      objectType: "Subscription",
      objectId: sub.id,
      summary: `Drafted quotation ${number} for ${refs.customer.businessName}`,
      changes: { total: priced.totals.total },
    });
    return { id: sub.id, number };
  });
}

/** Editing a sent quotation returns it to Draft as a new revision; it must be sent again. */
export async function updateQuotation(id: string, input: unknown): Promise<void> {
  const user = await requireStaff();
  const data = parseOrThrow(quoteSchema, input);
  await db.$transaction(async (tx) => {
    const before = await tx.subscription.findFirst({ where: { id, ...visibleTo(user) } });
    if (!before) throw notFound("Quotation not found.");
    if (before.status !== "DRAFT" && before.status !== "QUOTATION") throw new AppError("INVALID_TRANSITION", "Only a draft or sent quotation can be edited.");
    if (data.expectedVersion !== undefined && data.expectedVersion !== before.version) throw new AppError("CONFLICT", "This quotation was changed by someone else. Reload and try again.");
    const refs = await loadQuoteRefs(tx, user, data, true);
    const priced = await priceQuotation(tx, user, refs.plan, data);
    const revision = before.status === "QUOTATION" ? before.revision + 1 : before.revision;
    const updated = await tx.subscription.updateMany({
      where: { id, version: before.version },
      data: {
        customerId: refs.customer.id,
        planId: refs.plan.id,
        templateId: refs.template?.id ?? null,
        discountRuleId: data.discountRuleId ?? null,
        startDate: data.startDate,
        endDate: refs.endDate,
        paymentTermsDays: refs.paymentTermsDays,
        terms: data.terms ?? null,
        status: "DRAFT",
        quoteIssuedOn: null,
        quoteValidUntil: null,
        revision,
        version: { increment: 1 },
        ...priced.totals,
      },
    });
    if (updated.count !== 1) throw new AppError("CONFLICT", "This quotation was changed by someone else. Reload and try again.");
    await tx.subscriptionLine.deleteMany({ where: { subscriptionId: id } });
    for (const line of priced.lines) await tx.subscriptionLine.create({ data: { ...line, subscription: { connect: { id } } } });
    await recordAudit(tx, actorOf(user), {
      action: "subscription.revised",
      objectType: "Subscription",
      objectId: id,
      summary: before.status === "QUOTATION" ? `Revised ${before.number} (revision ${revision}); back to draft` : `Edited draft ${before.number}`,
      changes: { total: { from: before.total.toString(), to: priced.totals.total }, revision },
    });
  });
}

const reasonSchema = z.string().trim().min(3, "Give a short reason").max(500);

export async function transitionSubscription(
  id: string,
  action: LifecycleAction,
  opts: { reason?: unknown; expectedVersion?: number } = {},
): Promise<{ id: string; status: string; renewalId?: string }> {
  const user = await requireStaff();
  return db.$transaction(async (tx) => {
    const sub = await tx.subscription.findFirst({
      where: { id, ...visibleTo(user) },
      include: { plan: true, renewal: { select: { id: true } }, template: true, customer: true, lines: { orderBy: { position: "asc" } } },
    });
    if (!sub) throw notFound("Subscription not found.");
    if (opts.expectedVersion !== undefined && opts.expectedVersion !== sub.version) {
      throw new AppError("CONFLICT", "This subscription was changed by someone else. Reload to see its current state.");
    }
    const day = today(user);
    const check = checkTransition(action, { ...sub, hasRenewal: !!sub.renewal }, day);
    if (!check.ok) throw new AppError("INVALID_TRANSITION", check.reason);

    const now = new Date();
    const data: Prisma.SubscriptionUpdateManyMutationInput = { status: check.to, version: { increment: 1 } };
    let reason: string | undefined;
    let renewalId: string | undefined;
    switch (action) {
      case "send":
        data.quoteIssuedOn = day;
        data.quoteValidUntil = addDays(day, sub.template?.validityDays ?? 30);
        break;
      case "confirm":
        data.confirmedAt = now;
        break;
      case "activate":
        data.activatedAt = now;
        data.nextBillDate = nextBillDateOnOrAfter(sub.startDate, sub.plan.interval, sub.startDate, sub.endDate);
        break;
      case "pause":
        data.pausedAt = now;
        break;
      case "resume":
        data.pausedAt = null;
        data.nextBillDate = nextBillDateOnOrAfter(sub.startDate, sub.plan.interval, compareDates(day, sub.startDate) > 0 ? day : sub.startDate, sub.endDate);
        break;
      case "close":
      case "cancel": {
        const parsed = reasonSchema.safeParse(opts.reason);
        if (!parsed.success) throw invalid("Check the highlighted fields.", { reason: parsed.error.issues[0].message });
        reason = parsed.data;
        data.closedAt = now;
        data.closeReason = reason;
        data.nextBillDate = null;
        break;
      }
      case "renew": {
        const startDate = addDays(sub.endDate!, 1);
        const priced = await priceQuotation(tx, user, sub.plan, {
          startDate,
          lines: sub.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        });
        const number = await nextNumber(tx, user.organizationId, "SUB");
        const renewal = await tx.subscription.create({
          data: {
            organizationId: user.organizationId,
            number,
            customerId: sub.customerId,
            planId: sub.planId,
            templateId: sub.templateId,
            ownerId: user.id,
            renewedFromId: sub.id,
            startDate,
            endDate: sub.plan.termLength ? termEndDate(startDate, sub.plan.interval, sub.plan.termLength) : null,
            paymentTermsDays: sub.paymentTermsDays,
            terms: sub.terms,
            ...priced.totals,
            lines: { create: priced.lines },
          },
        });
        renewalId = renewal.id;
        await recordAudit(tx, actorOf(user), {
          action: "subscription.drafted",
          objectType: "Subscription",
          objectId: renewal.id,
          summary: `Drafted renewal ${number} of ${sub.number} at current plan prices`,
        });
        break;
      }
    }

    const updated = await tx.subscription.updateMany({ where: { id, version: sub.version, status: sub.status }, data });
    if (updated.count !== 1) throw new AppError("CONFLICT", "This subscription was changed by someone else. Reload to see its current state.");

    if (action === "send") {
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const amount = formatMoney(sub.total.toString(), user.organization);
      await enqueueOutbox(tx, "email.send", `quote-sent:${sub.id}:${sub.revision}`, {
        to: sub.customer.email,
        subject: `Quotation ${sub.number} from ${user.organization.legalName}`,
        text: `Hello ${sub.customer.contactName},\n\n${user.organization.legalName} sent you quotation ${sub.number} for ${sub.plan.name}: ${amount} per billing period.\nValid through ${(data.quoteValidUntil as Date).toISOString().slice(0, 10)}.\n\nSign in to review it: ${appUrl}/portal/subscriptions\n`,
      });
    }
    const verb: Record<LifecycleAction, string> = {
      send: "Sent quotation",
      confirm: "Confirmed",
      activate: "Activated",
      pause: "Paused",
      resume: "Resumed",
      close: "Closed",
      cancel: "Withdrew quotation",
      renew: "Renewed",
    };
    await recordAudit(tx, actorOf(user), {
      action: `subscription.${action}`,
      objectType: "Subscription",
      objectId: id,
      summary: `${verb[action]} ${sub.number}${reason ? `: ${reason}` : ""}`,
      changes: { status: { from: sub.status, to: check.to }, ...(renewalId ? { renewalId } : {}) },
    });
    return { id, status: check.to, renewalId };
  });
}

export type SubscriptionView = "quotations" | "subscriptions";

export interface SubscriptionRow {
  id: string;
  number: string;
  customer: string;
  plan: string;
  interval: string;
  total: string;
  status: string;
  expired: boolean;
  quoteValidUntil: Date | null;
  nextBillDate: Date | null;
  endDate: Date | null;
  owner: string | null;
}

const VIEW_STATUSES = {
  quotations: ["DRAFT", "QUOTATION", "CONFIRMED"],
  subscriptions: ["ACTIVE", "PAUSED", "CLOSED"],
} as const;

export async function listSubscriptions(
  view: SubscriptionView,
  params: { q?: unknown; status?: unknown; planId?: unknown; page?: unknown },
): Promise<Page<SubscriptionRow>> {
  const user = await requireStaff();
  const q = textParam(params.q);
  const page = pageOf(params.page);
  const day = today(user);
  const allowed: readonly string[] = VIEW_STATUSES[view];
  const status = String(params.status ?? "");
  const statusFilter: Prisma.SubscriptionWhereInput =
    status === "ENDING"
      ? { status: "ACTIVE", endDate: { gte: day, lte: addDays(day, 30) } }
      : status === "EXPIRED"
        ? { status: "QUOTATION", quoteValidUntil: { lt: day } }
        : allowed.includes(status)
          ? { status: status as Prisma.EnumSubscriptionStatusFilter["equals"] }
          : view === "subscriptions" && status !== "all"
            ? { status: { in: ["ACTIVE", "PAUSED"] } }
            : { status: { in: [...allowed] as Prisma.EnumSubscriptionStatusFilter["in"] } };
  const where: Prisma.SubscriptionWhereInput = {
    ...visibleTo(user),
    ...statusFilter,
    ...(typeof params.planId === "string" && params.planId ? { planId: params.planId } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { customer: { businessName: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const orderBy: Prisma.SubscriptionOrderByWithRelationInput[] =
    view === "subscriptions" ? [{ nextBillDate: { sort: "asc", nulls: "last" } }, { number: "asc" }] : [{ createdAt: "desc" }];
  const [total, rows] = await Promise.all([
    db.subscription.count({ where }),
    db.subscription.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: { select: { businessName: true } }, plan: { select: { name: true, interval: true } }, owner: { select: { name: true } } },
    }),
  ]);
  return {
    total,
    page,
    pageSize: PAGE_SIZE,
    rows: rows.map((s) => ({
      id: s.id,
      number: s.number,
      customer: s.customer.businessName,
      plan: s.plan.name,
      interval: s.plan.interval,
      total: s.total.toString(),
      status: s.status,
      expired: isQuoteExpired(s, day),
      quoteValidUntil: s.quoteValidUntil,
      nextBillDate: s.nextBillDate,
      endDate: s.endDate,
      owner: s.owner?.name ?? null,
    })),
  };
}

export async function getSubscription(id: string) {
  const user = await requireStaff();
  const sub = await db.subscription.findFirst({
    where: { id, ...visibleTo(user) },
    include: {
      customer: true,
      plan: { include: { product: { select: { name: true } } } },
      template: { select: { id: true, name: true, validityDays: true } },
      owner: { select: { name: true } },
      discountRule: { select: { name: true } },
      lines: { orderBy: { position: "asc" } },
      renewal: { select: { id: true, number: true } },
      renewedFrom: { select: { id: true, number: true } },
      invoices: { orderBy: { issueDate: "desc" }, take: 20 },
    },
  });
  if (!sub) throw notFound("Subscription not found.");
  const day = today(user);
  const activity = await db.auditEvent.findMany({
    where: { organizationId: user.organizationId, objectType: "Subscription", objectId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return {
    ...sub,
    expired: isQuoteExpired(sub, day),
    actions: availableActions({ ...sub, hasRenewal: !!sub.renewal }, day),
    activity,
  };
}

export async function quoteFormOptions() {
  const user = await requireStaff();
  const day = today(user);
  const [customers, plans, products, templates, discounts] = await Promise.all([
    db.customer.findMany({ where: { organizationId: user.organizationId, archivedAt: null }, orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }),
    db.plan.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE", product: { status: "ACTIVE" } }, orderBy: { name: "asc" } }),
    db.product.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, variants: { where: { status: "ACTIVE" }, select: { id: true, attribute: true, value: true } } },
    }),
    db.quotationTemplate.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      include: { lines: { orderBy: { position: "asc" } } },
    }),
    db.discountRule.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { name: "asc" }] }),
  ]);
  return {
    customers,
    plans: plans.filter((p) => isPlanSellable(p, day)).map((p) => ({ id: p.id, name: p.name, productId: p.productId, minQuantity: p.minQuantity, interval: p.interval })),
    products,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      planId: t.planId,
      paymentTermsDays: t.paymentTermsDays,
      terms: t.terms,
      lines: t.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
    })),
    discounts: discounts.filter((d) => discountState(d, day) === "ACTIVE").map((d) => ({ id: d.id, name: d.name })),
  };
}
