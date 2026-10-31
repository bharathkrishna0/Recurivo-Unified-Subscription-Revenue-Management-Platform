import { SubNav } from "@/components/data/table";

export function SalesNav({ current }: { current: string }) {
  return (
    <SubNav
      current={current}
      items={[
        { label: "Quotations", href: "/app/sales/quotations" },
        { label: "Templates", href: "/app/sales/templates" },
      ]}
    />
  );
}
