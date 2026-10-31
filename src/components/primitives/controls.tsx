import { Field, inputClass } from "./field";
import { cn } from "@/lib/cn";

interface Option {
  value: string;
  label: string;
}

export function SelectField({
  label,
  name,
  error,
  hint,
  options,
  placeholder,
  className,
  ...props
}: { label: string; name: string; error?: string; hint?: React.ReactNode; options: Option[]; placeholder?: string; className?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} name={name} error={error} hint={hint} className={className}>
      {({ id, describedBy, invalid }) => (
        <select id={id} name={name} aria-describedby={describedBy} aria-invalid={invalid} className={cn(inputClass, "pr-8")} {...props}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function TextareaField({
  label,
  name,
  error,
  hint,
  className,
  ...props
}: { label: string; name: string; error?: string; hint?: React.ReactNode; className?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} name={name} error={error} hint={hint} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} name={name} aria-describedby={describedBy} aria-invalid={invalid} rows={4} className={cn(inputClass, "h-auto py-2")} {...props} />
      )}
    </Field>
  );
}

export function CheckboxField({
  label,
  name,
  hint,
  error,
  value,
  ...props
}: { label: string; name: string; hint?: React.ReactNode; error?: string; value?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="flex items-start gap-3 py-1">
      <input type="checkbox" name={name} value={value} className="mt-0.5 size-4 accent-[#141414]" aria-invalid={Boolean(error)} {...props} />
      <span className="flex flex-col">
        <span className="text-body font-medium">{label}</span>
        {hint ? <span className="text-small text-ink-muted">{hint}</span> : null}
        {error ? <span className="text-small font-semibold">— {error}</span> : null}
      </span>
    </label>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-5 border-t border-line pt-6">
      <legend className="sr-only">{title}</legend>
      <div>
        <h2 className="text-subsection font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-small text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}
