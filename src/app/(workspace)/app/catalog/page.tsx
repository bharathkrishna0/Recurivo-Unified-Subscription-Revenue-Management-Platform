import type { Metadata } from "next";
import { UpcomingSection } from "@/components/feedback/upcoming";

export const metadata: Metadata = { title: "Catalog" };

export default function Page() {
  return <UpcomingSection title="Catalog" description="Products, variants and recurring plans." />;
}
