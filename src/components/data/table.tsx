import Link from "next/link";
import { cn } from "@/lib/cn";

export function Table({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[640px] border-collapse text-left text-body">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, numeric, className }: { children?: React.ReactNode; numeric?: boolean; className?: string }) {
  return (
    <th scope="col" className={cn("h-10 border-b border-line px-3 text-small font-semibold text-ink-muted first:pl-0", numeric && "text-right", className)}>
      {children}
    </th>
  );
}

export function Td({ children, numeric, className }: { children?: React.ReactNode; numeric?: boolean; className?: string }) {
  return <td className={cn("h-12 border-b border-line px-3 align-middle first:pl-0", numeric && "text-right tabular-nums", className)}>{children}</td>;
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-ink underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-small text-ink-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <span className="flex gap-4">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="font-semibold text-ink hover:underline">
            Previous
          </Link>
        ) : null}
        {page < last ? (
          <Link href={hrefFor(page + 1)} className="font-semibold text-ink hover:underline">
            Next
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

export function SubNav({ items, current }: { items: { label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label="Section" className="mb-6 border-b border-line">
      <ul className="-mb-px flex gap-6 overflow-x-auto">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i.href === current ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center border-b-2 border-transparent text-body text-ink-muted hover:text-ink",
                i.href === current && "border-ink font-semibold text-ink",
              )}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
