import { cn } from "@/lib/cn";

export function EmptyState({ title, body, action, className }: { title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-2 border-y border-line py-10", className)}>
      <p className="text-subsection font-semibold">{title}</p>
      {body ? <p className="max-w-xl text-body text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Notice({ children, tone = "neutral", role }: { children: React.ReactNode; tone?: "neutral" | "strong"; role?: "status" | "alert" }) {
  return (
    <div
      role={role}
      className={cn(
        "rounded-control border px-4 py-3 text-body",
        tone === "strong" ? "border-ink border-l-4 font-medium" : "border-line bg-surface-subtle",
      )}
    >
      {children}
    </div>
  );
}
