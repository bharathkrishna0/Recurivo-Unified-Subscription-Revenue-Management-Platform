import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { recordAudit } from "@/server/platform/audit";
import { invalid } from "@/server/platform/errors";
import { parseOrThrow } from "@/server/identity/service";
import { actorOf, requireStaff } from "@/server/identity/session";
import { requireAdminFor } from "@/server/identity/access";
import { optional, wholeNumber } from "@/server/platform/validation";

const validTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
const validLocale = (l: string) => {
  try {
    return Intl.NumberFormat.supportedLocalesOf([l]).length > 0;
  } catch {
    return false;
  }
};

export const organizationSchema = z.object({
  legalName: z.string().trim().min(1, "Enter the legal name").max(160),
  supportEmail: optional(z.email("Enter a valid email address").max(254)),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter ISO currency code, e.g. INR"),
  timezone: z.string().trim().refine(validTimeZone, "Use an IANA time zone, e.g. Asia/Kolkata"),
  locale: z.string().trim().refine(validLocale, "Use a locale such as en-IN"),
  paymentTermsDays: wholeNumber(0, "Payment terms must be a whole number of days").max(365, "Payment terms cannot exceed 365 days"),
  passwordMinLength: wholeNumber(9, "Minimum password length must be at least 9").max(64, "Use 64 characters or fewer"),
});

export async function getOrganizationSettings() {
  const user = await requireStaff();
  const [org, invoiceCount] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: user.organizationId } }),
    db.invoice.count({ where: { organizationId: user.organizationId } }),
  ]);
  return { org, currencyLocked: invoiceCount > 0 };
}

/** Currency is locked once invoices exist so issued amounts never change meaning. */
export async function updateOrganization(input: unknown): Promise<void> {
  const user = await requireAdminFor("organization.update");
  const data = parseOrThrow(organizationSchema, input);
  await db.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    if (before.currency !== data.currency && (await tx.invoice.count({ where: { organizationId: before.id } })) > 0) {
      throw invalid("Check the highlighted fields.", { currency: "Currency cannot change after invoices have been issued" });
    }
    await tx.organization.update({ where: { id: before.id }, data: { ...data, supportEmail: data.supportEmail ?? null } });
    const changes: Record<string, { from: string | number | null; to: string | number | null }> = {};
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      const from = before[key] ?? null;
      const to = data[key] ?? null;
      if (from !== to) changes[key] = { from, to };
    }
    await recordAudit(tx, actorOf(user), {
      action: "organization.updated",
      objectType: "Organization",
      objectId: before.id,
      summary: `Updated organization settings (${Object.keys(changes).join(", ") || "no changes"})`,
      changes,
    });
  });
}
