"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field, inputClass } from "./field";

export function PasswordField({
  label,
  name,
  error,
  hint,
  autoComplete,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  autoComplete: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} name={name} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={id}
            name={name}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            required
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-control text-ink-muted hover:text-ink"
          >
            {visible ? <EyeOff size={16} strokeWidth={1.75} aria-hidden /> : <Eye size={16} strokeWidth={1.75} aria-hidden />}
          </button>
        </div>
      )}
    </Field>
  );
}
