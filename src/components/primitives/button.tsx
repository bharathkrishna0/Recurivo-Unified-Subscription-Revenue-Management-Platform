import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "tertiary";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-ink disabled:border-line";

const variants: Record<Variant, string> = {
  primary: "on-action bg-action text-inverse hover:bg-[#2b2b2b] active:bg-black",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-hover active:bg-surface-pressed",
  tertiary: "text-ink underline-offset-4 hover:bg-surface-hover hover:underline",
};

const sizes: Record<Size, string> = {
  md: "h-10 px-4 text-body max-md:h-11",
  sm: "h-8 px-3 text-small",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
