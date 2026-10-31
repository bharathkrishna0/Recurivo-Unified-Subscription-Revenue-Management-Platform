import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { Pagination, RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { can } from "@/lib/permissions";
import { formatDay, formatMoney } from "@/lib/formatting";
import { listPayments } from "@/server/billing/payments";
import { openExceptionCount } from "@/server/billing/exceptions";
import { requireStaffPage } from "@/server/identity/session";
import { BillingNav } from "../billing-nav";
import { METHOD_LABEL } from "../load";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/app/billing/payments">) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const [data, exceptions] = await Promise.all([listPayments(sp), openExceptionCount(user.organizationId)]);
  const org = user.organization;
  return (
    <>
      <PageHeader title="Billing" description="Payments received and how they were applied." actions={can(user, "payments.record") ? <ButtonLink href="/app/billing/payments/new">Record payment</ButtonLink> : null} />
      <BillingNav current="/app/billing/payments" openExceptions={exceptions} />
      {data.rows.length === 0 ? (
        <EmptyState title="No payments recorded yet." body="Record a bank transfer, UPI, cheque or cash payment against a customer's invoices." />
      ) : (
        <Table caption="Payments">
          <thead>
            <tr>
              <Th>Payment</Th>
              <Th>Customer</Th>
              <Th>Received</Th>
              <Th>Method</Th>
              <Th>Reference</Th>
              <Th numeric>Amount</Th>
              <Th numeric>Applied</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.id}>
                <Td>
                  <RowLink href={`/app/billing/payments/${p.id}`}>{p.number}</RowLink>
                </Td>
                <Td>{p.customer}</Td>
                <Td>{formatDay(p.receivedOn, org.locale)}</Td>
                <Td>{METHOD_LABEL[p.method]}</Td>
                <Td>{p.reference ?? "—"}</Td>
                <Td numeric>{formatMoney(p.amount, org)}</Td>
                <Td numeric>{formatMoney(p.applied, org)}</Td>
                <Td>
                  <StatusLabel status={p.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => `/app/billing/payments?page=${p}`} />
    </>
  );
}
