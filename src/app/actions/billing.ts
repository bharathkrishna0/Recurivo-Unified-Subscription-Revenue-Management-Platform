"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dec } from "@/lib/money";
import { cancelInvoice, confirmInvoice, runBillingNow, sendInvoice } from "@/server/billing/invoices";
import { openInvoicesFor, recordPayment, reversePayment } from "@/server/billing/payments";
import { resolveException } from "@/server/billing/exceptions";
import { errorState, formValues, type FormState } from "./form-state";

type Op = "invoice.confirm" | "invoice.send" | "invoice.cancel" | "payment.reverse" | "exception.resolve" | "billing.run";

/** One confirm-then-submit action for every billing button; the server modules enforce permissions. */
export async function billingOpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const op = String(form.get("op") ?? "") as Op;
  const id = String(form.get("id") ?? "");
  const reason = form.get("reason");
  let target: string;
  try {
    switch (op) {
      case "invoice.confirm":
        await confirmInvoice(id);
        target = `/app/billing/invoices/${id}?done=confirmed`;
        break;
      case "invoice.send":
        await sendInvoice(id);
        target = `/app/billing/invoices/${id}?done=sent`;
        break;
      case "invoice.cancel":
        await cancelInvoice(id, reason);
        target = `/app/billing/invoices/${id}?done=cancelled`;
        break;
      case "payment.reverse":
        await reversePayment(id, reason);
        target = `/app/billing/payments/${id}?done=reversed`;
        break;
      case "exception.resolve":
        await resolveException(id, reason);
        target = "/app/billing/exceptions?done=resolved";
        break;
      case "billing.run": {
        const r = await runBillingNow();
        target = `/app/billing/invoices?run=${r.invoiced}-${r.failed}`;
        break;
      }
      default:
        throw new Error("Unknown billing action");
    }
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/billing", "layout");
  redirect(target);
}

export async function recordPaymentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const customerId = String(form.get("customerId") ?? "");
  let target: string;
  try {
    const allocations = [...form.entries()]
      .filter(([k, v]) => k.startsWith("alloc:") && typeof v === "string" && v.trim() !== "")
      .map(([k, v]) => ({ invoiceId: k.slice(6), amount: String(v).trim() }));
    const amount = String(form.get("amount") ?? "").trim();
    if (allocations.length === 0 && form.get("applyOldest") === "on" && /^\d+(\.\d+)?$/.test(amount)) {
      let left = dec(amount);
      for (const inv of await openInvoicesFor(customerId)) {
        if (left.lte(0)) break;
        const take = Math.min(Number(left), Number(dec(inv.total).minus(dec(inv.amountPaid))));
        if (take > 0) allocations.push({ invoiceId: inv.id, amount: dec(take).toFixed(2) });
        left = left.minus(take);
      }
    }
    const result = await recordPayment({
      customerId,
      method: form.get("method"),
      amount,
      receivedOn: form.get("receivedOn"),
      reference: form.get("reference"),
      note: form.get("note"),
      idempotencyKey: form.get("idempotencyKey"),
      allocations,
    });
    target = `/app/billing/payments/${result.id}?done=${result.replayed ? "replayed" : "recorded"}`;
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/billing", "layout");
  redirect(target);
}
