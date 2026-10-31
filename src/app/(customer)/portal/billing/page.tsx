import type { Metadata } from "next";
import { UpcomingSection } from "@/components/feedback/upcoming";

export const metadata: Metadata = { title: "Invoices & payments" };

export default function Page() {
  return <UpcomingSection title="Invoices & payments" description="Your invoices, payments and balance." root="/portal" />;
}
