import type { Metadata } from "next";
import { UpcomingSection } from "@/components/feedback/upcoming";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <UpcomingSection title="Settings" description="Organization, taxes, discounts, team and security." />;
}
