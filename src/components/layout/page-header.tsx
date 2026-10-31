import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
}: {
  title: string;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-small text-ink-muted">
              {breadcrumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 ? <span aria-hidden="true">/</span> : null}
                  {c.href ? (
                    <Link href={c.href} className="hover:text-ink hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-ink">
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="text-title font-semibold tracking-[-0.01em]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-body text-ink-muted">{description}</p> : null}
        {meta ? <div className="mt-2 text-small text-ink-subtle">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({ title, action, id }: { title: string; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
      <h2 id={id} className="text-section font-semibold">
        {title}
      </h2>
      {action}
    </div>
  );
}
