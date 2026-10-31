import type { Metadata } from "next";
import { UpcomingSection } from "@/components/feedback/upcoming";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return <UpcomingSection title="Customers" description="Businesses and people you bill." />;
}
