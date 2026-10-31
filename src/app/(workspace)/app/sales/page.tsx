import type { Metadata } from "next";
import { UpcomingSection } from "@/components/feedback/upcoming";

export const metadata: Metadata = { title: "Sales" };

export default function Page() {
  return <UpcomingSection title="Sales" description="Quotation templates and quotations." />;
}
