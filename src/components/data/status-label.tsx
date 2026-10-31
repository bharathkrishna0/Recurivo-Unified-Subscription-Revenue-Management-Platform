import { AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/cn";

const LABELS: Record<string, { text: string; tone?: "soft" | "strong"; icon?: "check" | "alert" }> = {
  ACTIVE: { text: "Active" },
  PAUSED: { text: "Paused", tone: "soft" },
  DRAFT: { text: "Draft", tone: "soft" },
  QUOTATION: { text: "Quotation" },
  CONFIRMED: { text: "Confirmed" },
  CLOSED: { text: "Closed", tone: "soft" },
  PAID: { text: "Paid", icon: "check" },
  PARTIALLY_PAID: { text: "Partially paid" },
  OVERDUE: { text: "Overdue", tone: "strong" },
  CANCELLED: { text: "Cancelled", tone: "soft" },
  FAILED: { text: "Action required", tone: "strong", icon: "alert" },
  OPEN: { text: "Open", tone: "strong" },
  RESOLVED: { text: "Resolved", tone: "soft" },
  ARCHIVED: { text: "Archived", tone: "soft" },
  EXPIRED: { text: "Expired", tone: "soft" },
  AWAITING_REVIEW: { text: "Awaiting your review", tone: "strong" },
  RECORDED: { text: "Recorded" },
  REVERSED: { text: "Reversed", tone: "soft" },
  SENT: { text: "Sent" },
  QUEUED: { text: "Queued", tone: "soft" },
  NOT_SENT: { text: "Not sent", tone: "soft" },
};

/** Monochrome status: meaning comes from wording and weight, never color. */
export function StatusLabel({ status, className }: { status: string; className?: string }) {
  const def = LABELS[status] ?? { text: status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ") };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-micro whitespace-nowrap",
        def.tone === "soft" && "border-line bg-surface-subtle text-ink-muted",
        def.tone === "strong" && "border-ink font-bold text-ink",
        !def.tone && "border-line-strong text-ink",
        className,
      )}
    >
      {def.icon === "check" ? <Check size={12} strokeWidth={2} aria-hidden /> : null}
      {def.icon === "alert" ? <AlertCircle size={12} strokeWidth={2} aria-hidden /> : null}
      {def.text}
    </span>
  );
}
