"use client";

import { useActionState, useState } from "react";
import {
  acceptInvitationAction,
  createDiscountAction,
  inviteStaffAction,
  saveOrganizationAction,
  saveTaxAction,
  updatePermissionsAction,
} from "@/app/actions/settings";
import type { FormState } from "@/app/actions/form-state";
import { Button } from "@/components/primitives/button";
import { CheckboxField, FormSection, SelectField } from "@/components/primitives/controls";
import { keepValues } from "@/components/primitives/keep-values";
import { TextField } from "@/components/primitives/field";
import { PasswordField } from "@/components/primitives/password-field";
import { FormMessage } from "@/features/catalog/forms";

const initial: FormState = {};

function SaveBar({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="flex gap-3 border-t border-line py-4">
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}

export function OrganizationForm({ org, currencyLocked }: { org: Record<string, string>; currencyLocked: boolean }) {
  const [state, action, pending] = useActionState(saveOrganizationAction, initial);
  const v = { ...org, ...state.values };
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-[760px] flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <FormSection title="Legal identity" description="Shown on quotations and invoices.">
        <TextField label="Legal name" name="legalName" defaultValue={v.legalName} error={state.fields?.legalName} />
        <TextField label="Support email" name="supportEmail" type="email" defaultValue={v.supportEmail} error={state.fields?.supportEmail} />
      </FormSection>
      <FormSection title="Money and dates" description="Billing dates are calendar dates in this time zone.">
        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            label="Currency"
            name="currency"
            defaultValue={v.currency}
            readOnly={currencyLocked}
            error={state.fields?.currency}
            hint={currencyLocked ? "Locked because invoices exist." : "ISO code, e.g. INR"}
          />
          <TextField label="Time zone" name="timezone" defaultValue={v.timezone} error={state.fields?.timezone} />
          <TextField label="Locale" name="locale" defaultValue={v.locale} error={state.fields?.locale} />
        </div>
        <TextField label="Payment terms (days)" name="paymentTermsDays" inputMode="numeric" defaultValue={v.paymentTermsDays} error={state.fields?.paymentTermsDays} hint="Invoice due date = issue date + this many days." />
      </FormSection>
      <FormSection title="Security">
        <TextField label="Minimum password length" name="passwordMinLength" inputMode="numeric" defaultValue={v.passwordMinLength} error={state.fields?.passwordMinLength} hint="At least 9. Passwords also need upper and lower case letters and a special character." />
      </FormSection>
      <SaveBar pending={pending} label="Save settings" />
    </form>
  );
}

export function TaxForm({
  tax,
  products,
}: {
  tax?: { id: string; name: string; jurisdiction: string; rate: string; scope: string; productIds: string[]; effectiveFrom: string; effectiveUntil: string };
  products: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveTaxAction, initial);
  const v = { ...tax, ...state.values };
  const [scope, setScope] = useState(v.scope ?? "ALL_PRODUCTS");
  const [rate, setRate] = useState(v.rate ?? "");
  const example = Number(rate) >= 0 && rate !== "" ? ((1000 * Number(rate)) / 100).toFixed(2) : null;
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-[760px] flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={tax?.id ?? ""} />
      <FormSection title="Rule">
        <TextField label="Name" name="name" defaultValue={v.name} error={state.fields?.name} />
        <TextField label="Jurisdiction" name="jurisdiction" defaultValue={v.jurisdiction} error={state.fields?.jurisdiction} hint="For example India or Karnataka." />
        <TextField
          label="Rate (%)"
          name="rate"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          error={state.fields?.rate}
          hint={example ? `Example: on 1,000.00 this adds ${example} tax.` : "Up to four decimal places."}
        />
      </FormSection>
      <FormSection title="Applies to">
        <SelectField
          label="Scope"
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          error={state.fields?.scope}
          options={[
            { value: "ALL_PRODUCTS", label: "All products" },
            { value: "SELECTED_PRODUCTS", label: "Selected products" },
          ]}
        />
        {scope === "SELECTED_PRODUCTS" ? (
          <div role="group" aria-label="Products" className="flex flex-col gap-1">
            {products.map((p) => (
              <CheckboxField key={p.id} label={p.name} name="productIds" value={p.id} defaultChecked={tax?.productIds.includes(p.id)} />
            ))}
            {state.fields?.productIds ? <p className="text-small font-semibold">— {state.fields.productIds}</p> : null}
          </div>
        ) : null}
      </FormSection>
      <FormSection title="Effective dates" description="Issued invoices keep the tax they were calculated with.">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Effective from" name="effectiveFrom" type="date" defaultValue={v.effectiveFrom} error={state.fields?.effectiveFrom} />
          <TextField label="Effective until" name="effectiveUntil" type="date" defaultValue={v.effectiveUntil} error={state.fields?.effectiveUntil} />
        </div>
      </FormSection>
      <SaveBar pending={pending} label="Save tax rule" />
    </form>
  );
}

export function DiscountForm({ products, currency, today }: { products: { id: string; name: string }[]; currency: string; today: string }) {
  const [state, action, pending] = useActionState(createDiscountAction, initial);
  const v = state.values ?? {};
  const [scope, setScope] = useState(v.scope ?? "SUBSCRIPTION");
  const [type, setType] = useState(v.type ?? "PERCENT");
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-[760px] flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <FormSection title="Discount">
        <TextField label="Name" name="name" defaultValue={v.name} error={state.fields?.name} />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              { value: "PERCENT", label: "Percentage" },
              { value: "FIXED", label: `Fixed amount (${currency})` },
            ]}
          />
          <TextField label={type === "PERCENT" ? "Value (%)" : `Value (${currency})`} name="value" inputMode="decimal" defaultValue={v.value} error={state.fields?.value} />
        </div>
      </FormSection>
      <FormSection title="Applies to" description="Only one discount applies per line or subscription; discounts do not stack.">
        <SelectField
          label="Scope"
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          options={[
            { value: "SUBSCRIPTION", label: "Whole subscription" },
            { value: "PRODUCT", label: "One product" },
          ]}
        />
        {scope === "PRODUCT" ? (
          <SelectField label="Product" name="productId" defaultValue={v.productId} placeholder="Choose a product" error={state.fields?.productId} options={products.map((p) => ({ value: p.id, label: p.name }))} />
        ) : null}
      </FormSection>
      <FormSection title="Eligibility">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Minimum quantity" name="minQuantity" inputMode="numeric" defaultValue={v.minQuantity} error={state.fields?.minQuantity} />
          <TextField label={`Minimum amount (${currency})`} name="minAmount" inputMode="decimal" defaultValue={v.minAmount} error={state.fields?.minAmount} />
          <TextField label="Starts" name="startsAt" type="date" defaultValue={v.startsAt ?? today} error={state.fields?.startsAt} />
          <TextField label="Ends" name="endsAt" type="date" defaultValue={v.endsAt} error={state.fields?.endsAt} />
          <TextField label="Usage limit" name="usageLimit" inputMode="numeric" defaultValue={v.usageLimit} error={state.fields?.usageLimit} hint="Leave blank for unlimited." />
          <TextField label="Priority" name="priority" inputMode="numeric" defaultValue={v.priority ?? "0"} error={state.fields?.priority} hint="Higher wins when several are eligible." />
        </div>
      </FormSection>
      <CheckboxField label="I confirm this discount should be available for new quotations and invoices" name="confirm" error={state.fields?.confirm} />
      <SaveBar pending={pending} label="Activate discount" />
    </form>
  );
}

export function InviteForm({ permissions }: { permissions: [string, string][] }) {
  const [state, action, pending] = useActionState(inviteStaffAction, initial);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex max-w-[760px] flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Name" name="name" defaultValue={state.values?.name} error={state.fields?.name} />
        <TextField label="Email" name="email" type="email" defaultValue={state.values?.email} error={state.fields?.email} />
      </div>
      <div role="group" aria-label="Permissions">
        <p className="mb-1 text-small font-semibold">Permissions</p>
        {permissions.map(([key, label]) => (
          <CheckboxField key={key} label={key} hint={label} name="permissions" value={key} />
        ))}
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}

export function PermissionsForm({ userId, current, permissions }: { userId: string; current: string[]; permissions: [string, string][] }) {
  const [state, action, pending] = useActionState(updatePermissionsAction, initial);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-2" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="userId" value={userId} />
      {permissions.map(([key, label]) => (
        <CheckboxField key={key} label={key} hint={label} name="permissions" value={key} defaultChecked={current.includes(key)} />
      ))}
      <CheckboxField label="I confirm this access change" name="confirm" error={state.fields?.confirm} />
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save access"}
        </Button>
      </div>
    </form>
  );
}

export function AcceptInvitationForm({ token, name, minLength }: { token: string; name: string; minLength: number }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, initial);
  return (
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <TextField label="Your name" name="name" defaultValue={state.values?.name ?? name} error={state.fields?.name} autoComplete="name" />
      <PasswordField label="Password" name="password" autoComplete="new-password" error={state.fields?.password} hint={`At least ${minLength} characters with upper and lower case letters and a special character.`} />
      <PasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" error={state.fields?.confirmPassword} />
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Join workspace"}
      </Button>
    </form>
  );
}
