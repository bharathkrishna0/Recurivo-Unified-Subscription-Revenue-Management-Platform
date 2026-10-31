import type { Metadata } from "next";
import { UpcomingSection } from "@/components/feedback/upcoming";

export const metadata: Metadata = { title: "Subscriptions" };

export default function Page() {
  return <UpcomingSection title="Subscriptions" description="Manage contracts and upcoming billing dates." />;
}
