import type { Metadata } from "next";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Help" };

const TERMS: [string, string][] = [
  ["Billed revenue", "Total of confirmed, non-cancelled invoices whose invoice date falls in the selected period, including tax."],
  ["Collected payments", "Recorded, non-reversed payments whose payment date falls in the selected period."],
  ["Outstanding balance", "Unpaid amount on confirmed invoices, regardless of due date."],
  ["Overdue", "Outstanding balance on invoices whose due date is before today in the organization timezone."],
  ["Active subscription", "A subscription in the Active state. Paused subscriptions do not generate new billing cycles."],
];

export default function HelpPage() {
  return (
    <div className="max-w-[760px]">
      <PageHeader title="Help" description="Definitions used across Recurivo." />
      <section aria-labelledby="definitions">
        <SectionHeader title="Definitions" id="definitions" />
        <dl className="divide-y divide-line">
          {TERMS.map(([term, def]) => (
            <div key={term} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
              <dt className="font-semibold">{term}</dt>
              <dd className="text-ink-muted">{def}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
