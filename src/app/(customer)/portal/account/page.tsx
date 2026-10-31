import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/server/db";
import { requireCustomerPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireCustomerPage();
  const customer = await db.customer.findFirst({ where: { id: user.customerId, organizationId: user.organizationId } });
  const rows: [string, string][] = [
    ["Name", user.name],
    ["Email", user.email],
    ["Business", customer?.businessName ?? "—"],
    ["Billing address", customer?.billingAddress ?? "Not provided"],
  ];
  return (
    <div className="max-w-[760px]">
      <PageHeader title="Account" description="Details used on your invoices. Contact the business to change them." />
      <dl className="divide-y divide-line border-y border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr]">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
