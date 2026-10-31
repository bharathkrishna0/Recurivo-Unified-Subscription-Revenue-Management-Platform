import type { Metadata } from "next";
import { UpcomingSection } from "@/components/feedback/upcoming";

export const metadata: Metadata = { title: "My subscriptions" };

export default function Page() {
  return <UpcomingSection title="My subscriptions" description="Plans you are subscribed to." root="/portal" />;
}
