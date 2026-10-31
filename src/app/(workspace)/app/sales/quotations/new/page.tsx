import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { formatDateOnly, todayIn } from "@/lib/dates";
import { QuotationForm } from "@/features/sales/forms";
import { quoteFormOptions } from "@/server/sales/subscriptions";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "New quotation" };

export default async function NewQuotationPage({ searchParams }: PageProps<"/app/sales/quotations/new">) {
  const user = await requireStaffPage();
  const { customerId } = await searchParams;
  const options = await quoteFormOptions();
  const org = user.organization;
  return (
    <>
      <PageHeader title="New quotation" breadcrumbs={[{ label: "Sales", href: "/app/sales/quotations" }, { label: "New quotation" }]} />
      {options.customers.length === 0 || options.plans.length === 0 ? (
        <EmptyState
          title={options.customers.length === 0 ? "Add a customer first." : "No plan is on sale today."}
          action={<ButtonLink href={options.customers.length === 0 ? "/app/customers/new" : "/app/catalog/plans"}>{options.customers.length === 0 ? "New customer" : "View plans"}</ButtonLink>}
        />
      ) : (
        <QuotationForm
          options={options}
          currency={org.currency}
          locale={org.locale}
          today={formatDateOnly(todayIn(org.timezone))}
          cancelHref="/app/sales/quotations"
          quote={{ customerId: typeof customerId === "string" ? customerId : undefined }}
        />
      )}
    </>
  );
}
