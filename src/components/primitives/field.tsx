import { useId } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "block h-10 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-subtle hover:border-line-strong focus-visible:border-ink disabled:bg-disabled-bg disabled:text-disabled-ink aria-[invalid=true]:border-ink aria-[invalid=true]:border-2 max-md:h-11";

interface FieldProps {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children?: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

/** Label above control, helper and error text linked through aria-describedby. */
export function Field({ label, name, error, hint, className, children }: FieldProps) {
  const id = `${name}-${useId()}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-body font-semibold">
        {label}
      </label>
      {children?.({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-small text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-small font-semibold text-ink">
          <span aria-hidden="true">— </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  name,
  error,
  hint,
  className,
  ...inputProps
}: Omit<FieldProps, "children"> & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} name={name} error={error} hint={hint} className={className}>
      {({ id, describedBy, invalid }) => (
        <input id={id} name={name} aria-describedby={describedBy} aria-invalid={invalid} className={inputClass} {...inputProps} />
      )}
    </Field>
  );
}
