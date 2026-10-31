import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass } from "@/components/primitives/button";
import { inputClass } from "@/components/primitives/field";
import { can } from "@/lib/permissions";
import { dec } from "@/lib/money";
import { formatDateOnly, todayIn } from "@/lib/dates";
import { formatDay, formatMoney } from "@/lib/formatting";
import { PaymentForm } from "@/features/billing/forms";
import { customerOptions } from "@/server/sales/customers";
import { openInvoicesFor } from "@/server/billing/payments";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "Record payment" };

export default async function NewPaymentPage({ searchParams }: PageProps<"/app/billing/payments/new">) {
  const user = await requireStaffPage();
  if (!can(user, "payments.record")) redirect("/app/billing/payments");
  const { customerId } = await searchParams;
  const org = user.organization;
  const customers = await customerOptions();
  const selected = typeof customerId === "string" ? customers.find((c) => c.id === customerId) : undefined;
  const invoices = selected ? await openInvoicesFor(selected.id) : [];
  return (
    <>
      <PageHeader title="Record payment" breadcrumbs={[{ label: "Payments", href: "/app/billing/payments" }, { label: "Record payment" }]} />
      <form method="get" className="mb-8 flex max-w-[760px] flex-wrap items-end gap-3">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-small font-semibold">
          Customer
          <select name="customerId" defaultValue={selected?.id ?? ""} className={inputClass} required>
            <option value="">Choose a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.businessName}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Show open invoices
        </button>
      </form>
      {selected ? (
        <PaymentForm
          key={selected.id}
          customerId={selected.id}
          idempotencyKey={randomUUID()}
          today={formatDateOnly(todayIn(org.timezone))}
          invoices={invoices.map((i) => {
            const balance = dec(i.total).minus(dec(i.amountPaid));
            return { id: i.id, number: i.number, due: formatDay(i.dueDate, org.locale), balance: balance.toFixed(2), balanceLabel: formatMoney(balance.toString(), org) };
          })}
        />
      ) : null}
    </>
  );
}
