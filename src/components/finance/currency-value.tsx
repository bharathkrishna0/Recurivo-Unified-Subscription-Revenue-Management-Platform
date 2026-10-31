import { formatMoney } from "@/lib/formatting";
import type { DecimalInput } from "@/lib/money";
import { cn } from "@/lib/cn";

export function CurrencyValue({
  value,
  currency,
  locale,
  className,
  withCode = true,
}: {
  value: DecimalInput;
  currency: string;
  locale: string;
  className?: string;
  withCode?: boolean;
}) {
  return <span className={cn("tabular whitespace-nowrap", className)}>{formatMoney(value, { currency, locale }, withCode)}</span>;
}
