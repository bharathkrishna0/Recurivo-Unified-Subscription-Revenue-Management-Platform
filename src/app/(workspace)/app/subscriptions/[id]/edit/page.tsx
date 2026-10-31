import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/feedback/states";
import { formatDateOnly, todayIn } from "@/lib/dates";
import { QuotationForm } from "@/features/sales/forms";
import { getSubscription, quoteFormOptions } from "@/server/sales/subscriptions";
import { requireStaffPage } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";

export const metadata: Metadata = { title: "Edit quotation" };

export default async function EditQuotationPage({ params }: PageProps<"/app/subscriptions/[id]/edit">) {
  const user = await requireStaffPage();
  const { id } = await params;
  const s = await getSubscription(id).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  if (s.status !== "DRAFT" && s.status !== "QUOTATION") redirect(`/app/subscriptions/${id}`);
  const options = await quoteFormOptions();
  const org = user.organization;
  return (
    <>
      <PageHeader title={`Edit ${s.number}`} breadcrumbs={[{ label: "Quotations", href: "/app/sales/quotations" }, { label: s.number, href: `/app/subscriptions/${id}` }, { label: "Edit" }]} />
      {s.status === "QUOTATION" ? (
        <div className="mb-6">
          <Notice tone="strong">This quotation was already sent. Saving creates revision {s.revision + 1} as a draft; send it again for the customer to confirm.</Notice>
        </div>
      ) : null}
      <QuotationForm
        options={options}
        currency={org.currency}
        locale={org.locale}
        today={formatDateOnly(todayIn(org.timezone))}
        cancelHref={`/app/subscriptions/${id}`}
        quote={{
          id: s.id,
          version: s.version,
          customerId: s.customerId,
          planId: s.planId,
          templateId: s.templateId ?? undefined,
          discountRuleId: s.discountRuleId ?? undefined,
          startDate: formatDateOnly(s.startDate),
          endDate: s.endDate ? formatDateOnly(s.endDate) : undefined,
          paymentTermsDays: String(s.paymentTermsDays),
          terms: s.terms ?? undefined,
          lines: s.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        }}
      />
    </>
  );
}
