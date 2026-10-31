"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCustomer, updateCustomer } from "@/server/sales/customers";
import { saveTemplate, setTemplateStatus } from "@/server/sales/templates";
import { createQuotation, customerTransition, previewQuotation, transitionSubscription, updateQuotation } from "@/server/sales/subscriptions";
import { LIFECYCLE_ACTIONS, type LifecycleAction } from "@/lib/lifecycle";
import { errorState, formValues, type FormState } from "./form-state";

export interface QuotePreview {
  lines: { lineSubtotal: string; discountAmount: string; taxAmount: string; total: string }[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
}

export interface QuoteFormState extends FormState {
  preview?: QuotePreview;
}

function linesOf(form: FormData): unknown {
  try {
    return JSON.parse(String(form.get("lines") ?? "[]"));
  } catch {
    return [];
  }
}

export async function saveCustomerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  const input = {
    businessName: form.get("businessName"),
    contactName: form.get("contactName"),
    email: form.get("email"),
    phone: form.get("phone"),
    billingAddress: form.get("billingAddress"),
    taxId: form.get("taxId"),
  };
  let target: string;
  try {
    target = id ? (await updateCustomer(id, input), id) : (await createCustomer(input)).id;
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/customers");
  redirect(`/app/customers/${target}?saved=1`);
}

export async function saveTemplateAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "") || null;
  let target: string;
  try {
    target = (
      await saveTemplate(id, {
        name: form.get("name"),
        planId: form.get("planId"),
        validityDays: form.get("validityDays"),
        paymentTermsDays: form.get("paymentTermsDays"),
        terms: form.get("terms"),
        lines: linesOf(form),
      })
    ).id;
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/sales/templates");
  redirect(`/app/sales/templates/${target}?saved=1`);
}

export async function templateStatusAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  await setTemplateStatus(id, form.get("status") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE");
  revalidatePath("/app/sales/templates");
  revalidatePath(`/app/sales/templates/${id}`);
}

export async function saveQuotationAction(_prev: QuoteFormState, form: FormData): Promise<QuoteFormState> {
  const id = String(form.get("id") ?? "");
  const input = {
    customerId: form.get("customerId"),
    planId: form.get("planId"),
    templateId: form.get("templateId"),
    discountRuleId: form.get("discountRuleId"),
    startDate: form.get("startDate"),
    endDate: form.get("endDate"),
    paymentTermsDays: form.get("paymentTermsDays"),
    terms: form.get("terms"),
    expectedVersion: form.get("expectedVersion"),
    lines: linesOf(form),
  };
  let target: string;
  try {
    if (form.get("intent") === "preview") {
      const priced = await previewQuotation(input);
      return {
        ok: true,
        values: formValues(form),
        preview: {
          lines: priced.lines.map((l) => ({
            lineSubtotal: String(l.lineSubtotal),
            discountAmount: String(l.discountAmount),
            taxAmount: String(l.taxAmount),
            total: String(l.total),
          })),
          ...priced.totals,
        },
      };
    }
    target = id ? (await updateQuotation(id, input), id) : (await createQuotation(input)).id;
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/sales/quotations");
  revalidatePath(`/app/subscriptions/${target}`);
  redirect(`/app/subscriptions/${target}?saved=1`);
}

export async function transitionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "") as LifecycleAction;
  // Authority comes from the session: customerTransition rejects anyone who is not a customer.
  const portal = form.get("from") === "portal";
  let renewalId: string | undefined;
  try {
    if (!LIFECYCLE_ACTIONS.includes(action)) throw new Error("Unknown action");
    const version = Number(form.get("expectedVersion"));
    const opts = { reason: form.get("reason"), expectedVersion: Number.isInteger(version) ? version : undefined };
    ({ renewalId } = portal ? await customerTransition(id, action, opts) : await transitionSubscription(id, action, opts));
  } catch (error) {
    return errorState(error, formValues(form));
  }
  if (portal) {
    revalidatePath("/portal", "layout");
    redirect(`/portal/subscriptions/${id}?done=${action}`);
  }
  revalidatePath("/app/subscriptions");
  revalidatePath("/app/sales/quotations");
  revalidatePath(`/app/subscriptions/${id}`);
  redirect(`/app/subscriptions/${renewalId ?? id}?done=${action}`);
}
