import { addIntervals, compareDates, type BillingIntervalName } from "./dates";

export type SubscriptionStatusName = "DRAFT" | "QUOTATION" | "CONFIRMED" | "ACTIVE" | "PAUSED" | "CLOSED";
export type LifecycleAction = "send" | "confirm" | "activate" | "pause" | "resume" | "close" | "cancel" | "renew";

export const LIFECYCLE_ACTIONS: LifecycleAction[] = ["send", "confirm", "activate", "pause", "resume", "close", "cancel", "renew"];

export interface LifecycleSubject {
  status: SubscriptionStatusName;
  quoteValidUntil: Date | null;
  endDate: Date | null;
  hasRenewal: boolean;
  plan: { allowPause: boolean; allowEarlyClose: boolean; allowRenewal: boolean };
}

export type TransitionCheck = { ok: true; to: SubscriptionStatusName } | { ok: false; reason: string };

export function isQuoteExpired(s: Pick<LifecycleSubject, "status" | "quoteValidUntil">, today: Date): boolean {
  return s.status === "QUOTATION" && !!s.quoteValidUntil && compareDates(today, s.quoteValidUntil) > 0;
}

const deny = (reason: string): TransitionCheck => ({ ok: false, reason });

/**
 * The only legal moves (QUO-04, SUB-01):
 *   Draft → Quotation → Confirmed → Active ⇄ Paused → Closed
 * plus withdrawing an unactivated quote and renewing a fixed-term contract.
 * Renewal leaves this subscription's status alone and creates a new draft.
 */
export function checkTransition(action: LifecycleAction, s: LifecycleSubject, today: Date): TransitionCheck {
  const contractEnded = !!s.endDate && compareDates(today, s.endDate) > 0;
  switch (action) {
    case "send":
      return s.status === "DRAFT" ? { ok: true, to: "QUOTATION" } : deny("Only a draft can be sent as a quotation.");
    case "confirm":
      if (s.status !== "QUOTATION") return deny("Only a sent quotation can be confirmed.");
      if (isQuoteExpired(s, today)) return deny("This quotation has expired. Edit it and send it again.");
      return { ok: true, to: "CONFIRMED" };
    case "activate":
      return s.status === "CONFIRMED" ? { ok: true, to: "ACTIVE" } : deny("Only a confirmed quotation can be activated.");
    case "pause":
      if (s.status !== "ACTIVE") return deny("Only an active subscription can be paused.");
      if (!s.plan.allowPause) return deny("This plan does not allow pausing.");
      return { ok: true, to: "PAUSED" };
    case "resume":
      return s.status === "PAUSED" ? { ok: true, to: "ACTIVE" } : deny("Only a paused subscription can be resumed.");
    case "close":
      if (s.status !== "ACTIVE" && s.status !== "PAUSED") return deny("Only an active or paused subscription can be closed.");
      if (!contractEnded && !s.plan.allowEarlyClose) return deny("This plan does not allow closing before the contract ends.");
      return { ok: true, to: "CLOSED" };
    case "cancel":
      return ["DRAFT", "QUOTATION", "CONFIRMED"].includes(s.status)
        ? { ok: true, to: "CLOSED" }
        : deny("Only a quotation that has not been activated can be withdrawn.");
    case "renew":
      if (s.status !== "ACTIVE" && s.status !== "CLOSED") return deny("Only an active or closed subscription can be renewed.");
      if (!s.endDate) return deny("Only a fixed-term subscription can be renewed.");
      if (!s.plan.allowRenewal) return deny("This plan does not allow renewal.");
      if (s.hasRenewal) return deny("This subscription has already been renewed.");
      return { ok: true, to: s.status };
  }
}

export function availableActions(s: LifecycleSubject, today: Date): LifecycleAction[] {
  return LIFECYCLE_ACTIONS.filter((a) => checkTransition(a, s, today).ok);
}

/** Last day of a fixed term: start + n periods − 1 day. */
export function termEndDate(start: Date, interval: BillingIntervalName, termLength: number): Date {
  const next = addIntervals(start, interval, termLength);
  return new Date(next.getTime() - 86_400_000);
}

/**
 * First scheduled bill date on or after `today`. Periods that fell inside a
 * pause are skipped, not back-billed. Null once the contract has ended.
 */
export function nextBillDateOnOrAfter(
  start: Date,
  interval: BillingIntervalName,
  today: Date,
  endDate: Date | null,
): Date | null {
  let k = 0;
  let candidate = start;
  while (compareDates(candidate, today) < 0) candidate = addIntervals(start, interval, ++k);
  return endDate && compareDates(candidate, endDate) > 0 ? null : candidate;
}
