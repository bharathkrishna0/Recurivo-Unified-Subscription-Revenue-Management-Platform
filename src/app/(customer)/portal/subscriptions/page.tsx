import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDay, formatMoney, intervalLabel } from "@/lib/formatting";
import { requireCustomerPage } from "@/server/identity/session";
import { mySubscriptions } from "@/server/portal";

export const metadata: Metadata = { title: "My subscriptions" };

export default async function MySubscriptionsPage() {
  const user = await requireCustomerPage();
  const org = user.organization;
  const subs = await mySubscriptions();
  return (
    <>
      <PageHeader title="My subscriptions" description="Your plans, billing dates and quotations waiting for your review." />
      {subs.length === 0 ? (
        <EmptyState title="No subscriptions yet." body="When the business sends you a quotation, it appears here for you to review." />
      ) : (
        <Table caption="My subscriptions">
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Plan</Th>
              <Th>Billing</Th>
              <Th>Status</Th>
              <Th>Started</Th>
              <Th>Ends</Th>
              <Th>Next charge</Th>
              <Th numeric>Amount per period</Th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <Td>
                  <RowLink href={`/portal/subscriptions/${s.id}`}>{s.number}</RowLink>
                </Td>
                <Td>{s.plan}</Td>
                <Td>{intervalLabel[s.interval]}</Td>
                <Td>
                  <StatusLabel status={s.expired ? "EXPIRED" : s.status === "QUOTATION" ? "AWAITING_REVIEW" : s.status} />
                </Td>
                <Td>{formatDay(s.startDate, org.locale)}</Td>
                <Td>{s.endDate ? formatDay(s.endDate, org.locale) : "Ongoing"}</Td>
                <Td>{s.status === "ACTIVE" ? formatDay(s.nextBillDate, org.locale) : "—"}</Td>
                <Td numeric>{formatMoney(s.total, org)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
