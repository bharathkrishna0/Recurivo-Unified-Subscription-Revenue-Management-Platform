import { SubNav } from "@/components/data/table";

export function CatalogNav({ current }: { current: string }) {
  return (
    <SubNav
      current={current}
      items={[
        { label: "Products", href: "/app/catalog/products" },
        { label: "Plans", href: "/app/catalog/plans" },
      ]}
    />
  );
}
