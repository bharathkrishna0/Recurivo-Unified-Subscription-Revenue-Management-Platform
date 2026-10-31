"use client";

import { useActionState, useState } from "react";
import { saveCustomerAction, saveQuotationAction, saveTemplateAction, transitionAction, type QuoteFormState } from "@/app/actions/sales";
import type { FormState } from "@/app/actions/form-state";
import { FormMessage } from "@/features/catalog/forms";
import { Button } from "@/components/primitives/button";
import { FormSection, SelectField, TextareaField } from "@/components/primitives/controls";
import { TextField } from "@/components/primitives/field";
import { formatMoney } from "@/lib/formatting";
import { LineEditor, useLineRows, type EditorLine, type ProductOption } from "./line-editor";

const initial: FormState = {};

function Actions({ pending, label, cancelHref, children }: { pending: boolean; label: string; cancelHref: string; children?: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-line bg-surface py-4">
      {children}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
      <a href={cancelHref} className="inline-flex h-10 items-center px-2 text-body underline-offset-4 hover:underline">
        Cancel
      </a>
    </div>
  );
}

export interface CustomerDefaults {
  id?: string;
  businessName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  taxId?: string;
}

export function CustomerForm({ customer, cancelHref }: { customer?: CustomerDefaults; cancelHref: string }) {
  const [state, action, pending] = useActionState(saveCustomerAction, initial);
  const v = { ...customer, ...state.values };
  return (
    <form action={action} className="flex max-w-[760px] flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={customer?.id ?? ""} />
      <FormSection title="Business">
        <TextField label="Business name" name="businessName" required defaultValue={v.businessName} error={state.fields?.businessName} />
        <TextField label="Tax ID" name="taxId" defaultValue={v.taxId} error={state.fields?.taxId} hint="Printed on invoices when set." />
        <TextareaField label="Billing address" name="billingAddress" defaultValue={v.billingAddress} error={state.fields?.billingAddress} />
      </FormSection>
      <FormSection title="Contact" description="Quotations and invoices are emailed to this address.">
        <TextField label="Contact name" name="contactName" required defaultValue={v.contactName} error={state.fields?.contactName} />
        <TextField label="Email" name="email" type="email" required defaultValue={v.email} error={state.fields?.email} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={v.phone} error={state.fields?.phone} />
      </FormSection>
      <Actions pending={pending} label="Save customer" cancelHref={cancelHref} />
    </form>
  );
}

interface PlanOption {
  id: string;
  name: string;
  productId: string;
  minQuantity: number;
  interval: string;
}

export interface TemplateDefaults {
  id?: string;
  name?: string;
  planId?: string;
  validityDays?: string;
  paymentTermsDays?: string;
  terms?: string;
  lines?: EditorLine[];
}

export function TemplateForm({ template, plans, products, cancelHref }: { template?: TemplateDefaults; plans: PlanOption[]; products: ProductOption[]; cancelHref: string }) {
  const [state, action, pending] = useActionState(saveTemplateAction, initial);
  const v = { ...template, ...state.values };
  const lines = useLineRows(template?.lines ?? []);
  return (
    <form action={action} className="flex max-w-[960px] flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={template?.id ?? ""} />
      <FormSection title="Template">
        <TextField label="Template name" name="name" required defaultValue={v.name} error={state.fields?.name} />
        <SelectField
          label="Plan"
          name="planId"
          defaultValue={v.planId}
          placeholder="Choose a plan"
          error={state.fields?.planId}
          options={plans.map((p) => ({ value: p.id, label: p.name }))}
        />
        <TextField label="Valid for (days)" name="validityDays" inputMode="numeric" defaultValue={v.validityDays ?? "30"} error={state.fields?.validityDays} hint="A quotation expires this many days after it is sent." />
        <TextField label="Payment terms (days)" name="paymentTermsDays" inputMode="numeric" defaultValue={v.paymentTermsDays} error={state.fields?.paymentTermsDays} hint="Leave empty to use the organization default." />
      </FormSection>
      <LineEditor rows={lines.rows} setRows={lines.setRows} products={products} errors={state.fields} />
      <TextareaField label="Terms" name="terms" defaultValue={v.terms} error={state.fields?.terms} />
      <Actions pending={pending} label="Save template" cancelHref={cancelHref} />
    </form>
  );
}

export interface QuoteOptions {
  customers: { id: string; businessName: string }[];
  plans: PlanOption[];
  products: ProductOption[];
  templates: { id: string; name: string; planId: string; paymentTermsDays: number | null; terms: string | null; lines: EditorLine[] }[];
  discounts: { id: string; name: string }[];
}

export interface QuoteDefaults {
  id?: string;
  version?: number;
  customerId?: string;
  planId?: string;
  templateId?: string;
  discountRuleId?: string;
  startDate?: string;
  endDate?: string;
  paymentTermsDays?: string;
  terms?: string;
  lines?: EditorLine[];
}

export function QuotationForm({
  quote,
  options,
  currency,
  locale,
  today,
  cancelHref,
}: {
  quote?: QuoteDefaults;
  options: QuoteOptions;
  currency: string;
  locale: string;
  today: string;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<QuoteFormState, FormData>(saveQuotationAction, initial);
  const v = { ...quote, ...state.values };
  const lines = useLineRows(quote?.lines ?? []);
  const [planId, setPlanId] = useState(quote?.planId ?? "");
  const [templateId, setTemplateId] = useState(quote?.templateId ?? "");
  const [terms, setTerms] = useState(quote?.terms ?? "");
  const [paymentTerms, setPaymentTerms] = useState(quote?.paymentTermsDays ?? "");
  const plan = options.plans.find((p) => p.id === planId);
  const money = (x: string) => formatMoney(x, { currency, locale });
  const preview = state.preview;

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = options.templates.find((x) => x.id === id);
    if (!t) return;
    setPlanId(t.planId);
    if (t.lines.length) lines.replace(t.lines);
    if (t.terms) setTerms(t.terms);
    if (t.paymentTermsDays !== null) setPaymentTerms(String(t.paymentTermsDays));
  };

  return (
    <form action={action} className="flex max-w-[960px] flex-col gap-6" noValidate>
      <FormMessage state={preview ? {} : state} />
      <input type="hidden" name="id" value={quote?.id ?? ""} />
      <input type="hidden" name="expectedVersion" value={quote?.version ?? ""} />
      <FormSection title="Customer and plan">
        <SelectField
          label="Customer"
          name="customerId"
          defaultValue={v.customerId}
          placeholder="Choose a customer"
          error={state.fields?.customerId}
          options={options.customers.map((c) => ({ value: c.id, label: c.businessName }))}
        />
        <SelectField
          label="Start from template"
          name="templateId"
          value={templateId}
          onChange={(e) => applyTemplate(e.target.value)}
          placeholder="No template"
          error={state.fields?.templateId}
          options={options.templates.map((t) => ({ value: t.id, label: t.name }))}
          hint="Fills in the plan, lines and terms. You can change them afterwards."
        />
        <SelectField
          label="Plan"
          name="planId"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          placeholder="Choose a plan"
          error={state.fields?.planId}
          options={options.plans.map((p) => ({ value: p.id, label: p.name }))}
          hint={plan ? `Minimum quantity ${plan.minQuantity} for the plan's product.` : "Only plans on sale today are listed."}
        />
      </FormSection>
      <FormSection title="Contract">
        <TextField label="Start date" name="startDate" type="date" defaultValue={v.startDate ?? today} error={state.fields?.startDate} hint="The first bill date." />
        <TextField label="End date" name="endDate" type="date" defaultValue={v.endDate} error={state.fields?.endDate} hint="Leave empty for an open-ended subscription. Plans with a fixed term set this automatically." />
        <TextField
          label="Payment terms (days)"
          name="paymentTermsDays"
          inputMode="numeric"
          value={paymentTerms}
          onChange={(e) => setPaymentTerms(e.target.value)}
          error={state.fields?.paymentTermsDays}
          hint="Leave empty to use the organization default."
        />
      </FormSection>
      <LineEditor rows={lines.rows} setRows={lines.setRows} products={options.products} errors={state.fields} computed={preview?.lines.map((l) => ({ total: money(l.total) }))} />
      <FormSection title="Pricing" description="Unit prices come from the plan and catalog. Taxes in effect on the start date apply automatically.">
        <SelectField
          label="Discount"
          name="discountRuleId"
          defaultValue={v.discountRuleId}
          placeholder="No discount"
          error={state.fields?.discountRuleId}
          options={options.discounts.map((d) => ({ value: d.id, label: d.name }))}
        />
      </FormSection>
      {preview ? (
        <dl className="grid max-w-sm grid-cols-2 gap-y-1 border-t border-line pt-3 text-body" aria-live="polite">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd className="tabular text-right">{money(preview.subtotal)}</dd>
          <dt className="text-ink-muted">Discount</dt>
          <dd className="tabular text-right">−{money(preview.discountTotal)}</dd>
          <dt className="text-ink-muted">Tax</dt>
          <dd className="tabular text-right">{money(preview.taxTotal)}</dd>
          <dt className="font-semibold">Total per period</dt>
          <dd className="tabular text-right font-semibold">{money(preview.total)}</dd>
        </dl>
      ) : null}
      <TextareaField label="Terms" name="terms" value={terms} onChange={(e) => setTerms(e.target.value)} error={state.fields?.terms} />
      <Actions pending={pending} label={quote?.id ? "Save as new draft" : "Save draft"} cancelHref={cancelHref}>
        <Button type="submit" name="intent" value="preview" variant="secondary" disabled={pending}>
          Preview totals
        </Button>
      </Actions>
    </form>
  );
}

export function TransitionForm({
  id,
  version,
  action: lifecycleAction,
  label,
  consequence,
  needsReason,
  primary,
  portal,
}: {
  id: string;
  version: number;
  action: string;
  label: string;
  consequence: string;
  needsReason?: boolean;
  primary?: boolean;
  portal?: boolean;
}) {
  const [state, action, pending] = useActionState(transitionAction, initial);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant={primary ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={action} className="flex w-full max-w-[560px] flex-col gap-3 border border-line-strong p-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={lifecycleAction} />
      <input type="hidden" name="expectedVersion" value={version} />
      {portal ? <input type="hidden" name="from" value="portal" /> : null}
      <p className="text-body">{consequence}</p>
      {needsReason ? <TextareaField label="Reason" name="reason" required defaultValue={state.values?.reason} error={state.fields?.reason} rows={2} /> : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Working…" : `Confirm: ${label.toLowerCase()}`}
        </Button>
        <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
          Keep as is
        </Button>
      </div>
    </form>
  );
}
