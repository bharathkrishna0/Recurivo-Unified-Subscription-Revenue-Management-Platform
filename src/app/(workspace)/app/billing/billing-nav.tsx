import { SubNav } from "@/components/data/table";

export function BillingNav({ current, openExceptions }: { current: string; openExceptions?: number }) {
  return (
    <SubNav
      current={current}
      items={[
        { label: "Invoices", href: "/app/billing/invoices" },
        { label: "Payments", href: "/app/billing/payments" },
        { label: openExceptions ? `Exceptions (${openExceptions})` : "Exceptions", href: "/app/billing/exceptions" },
      ]}
    />
  );
}
