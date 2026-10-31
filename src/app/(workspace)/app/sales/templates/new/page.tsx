import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/permissions";
import { TemplateForm } from "@/features/sales/forms";
import { quoteFormOptions } from "@/server/sales/subscriptions";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  const user = await requireStaffPage();
  if (!can(user, "catalog.write")) redirect("/app/sales/templates");
  const options = await quoteFormOptions();
  return (
    <>
      <PageHeader title="New template" breadcrumbs={[{ label: "Templates", href: "/app/sales/templates" }, { label: "New" }]} />
      <TemplateForm plans={options.plans} products={options.products} cancelHref="/app/sales/templates" />
    </>
  );
}
