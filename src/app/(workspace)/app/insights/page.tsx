import type { Metadata } from "next";
import { UpcomingSection } from "@/components/feedback/upcoming";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "Insights" };

export default async function Page() {
  await requireStaffPage("reports.view");
  return <UpcomingSection title="Insights" description="Billed revenue, collections and outstanding balances." />;
}
