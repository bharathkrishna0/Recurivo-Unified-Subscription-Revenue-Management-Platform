"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { billingOpAction, recordPaymentAction } from "@/app/actions/billing";
import type { FormState } from "@/app/actions/form-state";
import { FormMessage } from "@/features/catalog/forms";
import { Button } from "@/components/primitives/button";
import { CheckboxField, FormSection, SelectField, TextareaField } from "@/components/primitives/controls";
import { TextField, inputClass } from "@/components/primitives/field";

const initial: FormState = {};

/** A button that expands into an explicit confirmation stating the consequence. */
export function BillingOpForm({
  op,
  id,
  label,
  consequence,
  reasonLabel,
  primary,
}: {
  op: string;
  id: string;
  label: string;
  consequence: string;
  reasonLabel?: string;
  primary?: boolean;
}) {
  const [state, action, pending] = useActionState(billingOpAction, initial);
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
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="id" value={id} />
      <p className="text-body">{consequence}</p>
      {reasonLabel ? <TextareaField label={reasonLabel} name="reason" required defaultValue={state.values?.reason} error={state.fields?.reason ?? state.fields?.resolution} rows={2} /> : null}
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

export interface OpenInvoiceOption {
  id: string;
  number: string;
  due: string;
  balance: string;
  balanceLabel: string;
}

const METHOD_OPTIONS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "UPI", label: "UPI" },
  { value: "CARD_EXTERNAL", label: "Card (external terminal)" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
  { value: "OTHER", label: "Other" },
];

export function PaymentForm({ customerId, idempotencyKey, today, invoices }: { customerId: string; idempotencyKey: string; today: string; invoices: OpenInvoiceOption[] }) {
  const [state, action, pending] = useActionState(recordPaymentAction, initial);
  const v = state.values ?? {};
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex max-w-[760px] flex-col gap-8" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <FormSection title="Payment" description="Record money already received. Gateway payments arrive in a later milestone.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Amount received" name="amount" inputMode="decimal" required defaultValue={v.amount} error={f.amount} />
          <TextField label="Received on" name="receivedOn" type="date" required defaultValue={v.receivedOn ?? today} error={f.receivedOn} />
          <SelectField label="Method" name="method" options={METHOD_OPTIONS} defaultValue={v.method ?? "BANK_TRANSFER"} error={f.method} />
          <TextField label="Reference" name="reference" hint="Bank reference, UTR or cheque number" defaultValue={v.reference} error={f.reference} />
        </div>
        <TextareaField label="Note" name="note" rows={2} defaultValue={v.note} error={f.note} />
      </FormSection>
      <FormSection title="Apply to invoices" description="Enter how much of this payment settles each invoice. Anything left over stays unapplied on the customer.">
        {invoices.length === 0 ? (
          <p className="text-body text-ink-muted">This customer has no open invoices. The payment will be recorded as unapplied.</p>
        ) : (
          <>
            <CheckboxField label="If no amounts are entered, apply to the oldest invoices first" name="applyOldest" defaultChecked />
            <table className="w-full border-collapse text-body">
              <caption className="sr-only">Open invoices</caption>
              <thead>
                <tr className="border-b border-line text-left text-small text-ink-muted">
                  <th className="py-2 font-semibold">Invoice</th>
                  <th className="py-2 font-semibold">Due</th>
                  <th className="py-2 text-right font-semibold">Balance</th>
                  <th className="py-2 text-right font-semibold">Apply</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={inv.id} className="border-b border-line">
                    <td className="py-2">{inv.number}</td>
                    <td className="py-2">{inv.due}</td>
                    <td className="py-2 text-right tabular-nums">{inv.balanceLabel}</td>
                    <td className="py-2 text-right">
                      <label className="sr-only" htmlFor={`alloc-${inv.id}`}>
                        Amount to apply to {inv.number}
                      </label>
                      <input id={`alloc-${inv.id}`} name={`alloc:${inv.id}`} inputMode="decimal" placeholder="0.00" defaultValue={v[`alloc:${inv.id}`]} aria-invalid={!!f[`allocations.${i}.amount`]} className={`${inputClass} w-32 text-right tabular-nums`} />
                      {f[`allocations.${i}.amount`] ? <p className="mt-1 text-small font-semibold">{f[`allocations.${i}.amount`]}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </FormSection>
      <div className="sticky bottom-0 flex gap-3 border-t border-line bg-surface py-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record payment"}
        </Button>
        <Link href="/app/billing/payments" className="inline-flex h-10 items-center px-2 text-body underline-offset-4 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
