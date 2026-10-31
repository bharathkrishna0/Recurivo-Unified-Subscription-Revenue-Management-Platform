"use client";

import { useActionState } from "react";
import { addVariantAction, savePlanAction, saveProductAction } from "@/app/actions/catalog";
import type { FormState } from "@/app/actions/form-state";
import { Notice } from "@/components/feedback/states";
import { Button } from "@/components/primitives/button";
import { CheckboxField, FormSection, SelectField, TextareaField } from "@/components/primitives/controls";
import { keepValues } from "@/components/primitives/keep-values";
import { TextField } from "@/components/primitives/field";

const initial: FormState = {};

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Notice tone={state.ok ? "neutral" : "strong"} role={state.ok ? "status" : "alert"}>
      {state.message}
    </Notice>
  );
}

export interface ProductDefaults {
  id?: string;
  name?: string;
  type?: string;
  salePrice?: string;
  costPrice?: string;
  notes?: string;
}

export function ProductForm({ product, currency, cancelHref }: { product?: ProductDefaults; currency: string; cancelHref: string }) {
  const [state, action, pending] = useActionState(saveProductAction, initial);
  const v = { ...product, ...state.values };
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-[760px] flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <FormSection title="Details">
        <TextField label="Name" name="name" required defaultValue={v.name} error={state.fields?.name} />
        <SelectField
          label="Type"
          name="type"
          defaultValue={v.type ?? "SERVICE"}
          error={state.fields?.type}
          options={[
            { value: "SERVICE", label: "Service" },
            { value: "GOODS", label: "Goods" },
          ]}
        />
      </FormSection>
      <FormSection title="Pricing" description={`Amounts in ${currency}. Changing the sale price does not reprice existing subscriptions or invoices.`}>
        <TextField label="Sale price" name="salePrice" inputMode="decimal" required defaultValue={v.salePrice} error={state.fields?.salePrice} />
        <TextField label="Cost price (internal)" name="costPrice" inputMode="decimal" defaultValue={v.costPrice} error={state.fields?.costPrice} hint="Never shown to customers or on quotations." />
      </FormSection>
      <FormSection title="Notes">
        <TextareaField label="Internal notes" name="notes" defaultValue={v.notes} error={state.fields?.notes} />
      </FormSection>
      <div className="sticky bottom-0 flex gap-3 border-t border-line bg-surface py-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save product"}
        </Button>
        <a href={cancelHref} className="inline-flex h-10 items-center px-2 text-body underline-offset-4 hover:underline">
          Cancel
        </a>
      </div>
    </form>
  );
}

export function VariantForm({ productId, basePrice, currency }: { productId: string; basePrice: string; currency: string }) {
  const [state, action, pending] = useActionState(addVariantAction, initial);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Attribute" name="attribute" placeholder="Brand" defaultValue={state.values?.attribute} error={state.fields?.attribute} />
        <TextField label="Value" name="value" placeholder="Odoo" defaultValue={state.values?.value} error={state.fields?.value} />
        <SelectField
          label="Price change"
          name="adjustmentType"
          defaultValue={state.values?.adjustmentType ?? "FIXED"}
          options={[
            { value: "FIXED", label: `Fixed amount (${currency})` },
            { value: "PERCENT", label: "Percentage of base price" },
          ]}
        />
        <TextField
          label="Adjustment"
          name="adjustmentValue"
          inputMode="decimal"
          placeholder="560"
          defaultValue={state.values?.adjustmentValue}
          error={state.fields?.adjustmentValue}
          hint={`Added to the base price of ${basePrice} ${currency}. Use a minus sign for a reduction.`}
        />
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add variant"}
        </Button>
      </div>
    </form>
  );
}

export interface PlanDefaults {
  id?: string;
  productId?: string;
  name?: string;
  interval?: string;
  price?: string;
  minQuantity?: string;
  termLength?: string;
  availableFrom?: string;
  availableUntil?: string;
  allowPause?: boolean;
  allowEarlyClose?: boolean;
  allowRenewal?: boolean;
  autoCloseAtExpiry?: boolean;
  customerSelfService?: boolean;
}

export function PlanForm({
  plan,
  products,
  currency,
  cancelHref,
  activeSubscriptions = 0,
}: {
  plan?: PlanDefaults;
  products: { id: string; name: string }[];
  currency: string;
  cancelHref: string;
  activeSubscriptions?: number;
}) {
  const [state, action, pending] = useActionState(savePlanAction, initial);
  const v: Record<string, string | boolean | undefined> = { ...plan, ...state.values };
  const flag = (name: keyof PlanDefaults, fallback: boolean) => (state.values ? state.values[name] === "on" : (plan?.[name] as boolean | undefined) ?? fallback);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-[760px] flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={plan?.id ?? ""} />
      {plan?.id && activeSubscriptions > 0 ? (
        <Notice tone="strong">
          {activeSubscriptions} active or paused subscription{activeSubscriptions === 1 ? "" : "s"} use this plan. Changing the price or minimum
          quantity publishes a new version for new sales; existing subscriptions keep their agreed prices.
        </Notice>
      ) : null}
      <FormSection title="Plan identity">
        <TextField label="Plan name" name="name" required defaultValue={v.name as string} error={state.fields?.name} />
        <SelectField
          label="Product"
          name="productId"
          defaultValue={v.productId as string}
          placeholder="Choose a product"
          disabled={Boolean(plan?.id)}
          error={state.fields?.productId}
          options={products.map((p) => ({ value: p.id, label: p.name }))}
        />
        {plan?.id ? <input type="hidden" name="productId" value={plan.productId} /> : null}
      </FormSection>
      <FormSection title="Billing period">
        <SelectField
          label="Bills every"
          name="interval"
          defaultValue={(v.interval as string) ?? "MONTHLY"}
          error={state.fields?.interval}
          options={[
            { value: "DAILY", label: "Day" },
            { value: "WEEKLY", label: "Week" },
            { value: "MONTHLY", label: "Month" },
            { value: "YEARLY", label: "Year" },
          ]}
          hint="Monthly and yearly plans started on the 29th–31st bill on the last day of shorter months."
        />
        <TextField label="Term length (periods)" name="termLength" inputMode="numeric" defaultValue={v.termLength as string} error={state.fields?.termLength} hint="Leave blank for an open-ended subscription." />
      </FormSection>
      <FormSection title="Pricing and minimum quantity" description={`Price per unit in ${currency}, before tax.`}>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Price per unit" name="price" inputMode="decimal" required defaultValue={v.price as string} error={state.fields?.price} />
          <TextField label="Minimum quantity" name="minQuantity" inputMode="numeric" defaultValue={(v.minQuantity as string) ?? "1"} error={state.fields?.minQuantity} />
        </div>
      </FormSection>
      <FormSection title="Sale availability" description="Outside these dates the plan cannot be newly sold. Existing subscriptions continue.">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Available from" name="availableFrom" type="date" defaultValue={v.availableFrom as string} error={state.fields?.availableFrom} />
          <TextField label="Available until" name="availableUntil" type="date" defaultValue={v.availableUntil as string} error={state.fields?.availableUntil} />
        </div>
      </FormSection>
      <FormSection title="Lifecycle permissions">
        <CheckboxField label="Allow pause" name="allowPause" defaultChecked={flag("allowPause", false)} hint="Paused subscriptions create no new billing cycles." />
        <CheckboxField label="Allow early close" name="allowEarlyClose" defaultChecked={flag("allowEarlyClose", false)} />
        <CheckboxField label="Allow renewal" name="allowRenewal" defaultChecked={flag("allowRenewal", true)} />
        <CheckboxField label="Close automatically at expiry" name="autoCloseAtExpiry" defaultChecked={flag("autoCloseAtExpiry", true)} />
        <CheckboxField label="Customers may use permitted actions from the portal" name="customerSelfService" defaultChecked={flag("customerSelfService", false)} />
      </FormSection>
      <div className="sticky bottom-0 flex gap-3 border-t border-line bg-surface py-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save plan"}
        </Button>
        <a href={cancelHref} className="inline-flex h-10 items-center px-2 text-body underline-offset-4 hover:underline">
          Cancel
        </a>
      </div>
    </form>
  );
}
