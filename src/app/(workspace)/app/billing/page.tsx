import type { Metadata } from "next";
import { UpcomingSection } from "@/components/feedback/upcoming";

export const metadata: Metadata = { title: "Billing" };

export default function Page() {
  return <UpcomingSection title="Billing" description="Invoices, payments and billing exceptions." />;
}
