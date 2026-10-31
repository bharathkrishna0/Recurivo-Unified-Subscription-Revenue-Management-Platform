import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CustomerForm } from "@/features/sales/forms";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireStaffPage();
  return (
    <>
      <PageHeader title="New customer" breadcrumbs={[{ label: "Customers", href: "/app/customers" }, { label: "New" }]} />
      <CustomerForm cancelHref="/app/customers" />
    </>
  );
}
