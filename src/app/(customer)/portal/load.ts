import { notFound } from "next/navigation";
import type { LifecycleAction } from "@/lib/lifecycle";
import { AppError } from "@/server/platform/errors";

export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export const stateKey = (state: string) => state.toUpperCase().replaceAll(" ", "_");

export const CUSTOMER_ACTION_COPY: Partial<Record<LifecycleAction, { label: string; consequence: string; reason?: boolean; primary?: boolean }>> = {
  confirm: { label: "Accept quotation", consequence: "Confirms you accept this quotation and its terms. The business activates it and billing starts on the start date.", primary: true },
  pause: { label: "Pause subscription", consequence: "No new invoices are created while paused. Invoices already issued stay due." },
  resume: { label: "Resume subscription", consequence: "Billing restarts on the next scheduled date. Periods inside the pause are not billed." },
  close: { label: "Close subscription", consequence: "Ends the subscription today. No further invoices are created; invoices already issued stay due.", reason: true },
  renew: { label: "Request renewal", consequence: "Asks the business to prepare a renewal quotation for the next term at current prices. This subscription is not changed." },
};
