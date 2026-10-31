"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Boxes,
  CircleHelp,
  CreditCard,
  FileText,
  LayoutGrid,
  Menu,
  Repeat,
  Settings,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavItem } from "./nav";
import { UserMenu } from "./user-menu";

const ICONS = {
  overview: LayoutGrid,
  customers: Users,
  catalog: Boxes,
  sales: FileText,
  subscriptions: Repeat,
  billing: CreditCard,
  insights: BarChart3,
  settings: Settings,
  help: CircleHelp,
  account: UserRound,
} as const;

function isActive(pathname: string, href: string, root: string): boolean {
  if (href === root) return pathname === root;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ items, root, onNavigate }: { items: NavItem[]; root: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href, root);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-control px-3 text-body text-ink-muted hover:bg-surface-hover hover:text-ink max-md:h-11",
                active && "bg-surface-pressed font-semibold text-ink",
              )}
            >
              <Icon size={17} strokeWidth={1.75} aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Wordmark({ href }: { href: string }) {
  return (
    <Link href={href} className="text-[17px] font-bold tracking-[-0.02em] text-ink">
      Recurivo<span aria-hidden="true">.</span>
    </Link>
  );
}

export function AppShell({
  nav,
  footerNav = [],
  root,
  user,
  orgName,
  children,
}: {
  nav: NavItem[];
  footerNav?: NavItem[];
  root: string;
  user: { name: string; email: string; roleLabel: string };
  orgName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const returnFocusTo = menuButtonRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      returnFocusTo?.focus();
    };
  }, [open]);

  const sidebar = (onNavigate?: () => void) => (
    <nav aria-label="Primary" className="flex h-full flex-col gap-6 px-3 py-4">
      <NavList items={nav} root={root} onNavigate={onNavigate} />
      {footerNav.length ? (
        <div className="mt-auto border-t border-line pt-4">
          <NavList items={footerNav} root={root} onNavigate={onNavigate} />
        </div>
      ) : null}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface-subtle lg:flex">
        <div className="flex h-[var(--topbar-height)] items-center border-b border-line px-6">
          <Wordmark href={root} />
        </div>
        {sidebar()}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" tabIndex={-1} className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(320px,85vw)] flex-col border-r border-line bg-surface-subtle">
            <div className="flex h-[var(--topbar-height)] items-center justify-between border-b border-line px-4">
              <Wordmark href={root} />
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="flex size-11 items-center justify-center rounded-control hover:bg-surface-hover"
              >
                <X size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{sidebar(() => setOpen(false))}</div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center gap-3 border-b border-line bg-canvas/95 px-4 backdrop-blur md:px-6 lg:px-8">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
            className="flex size-11 items-center justify-center rounded-control hover:bg-surface-hover lg:hidden"
          >
            <Menu size={18} strokeWidth={1.75} aria-hidden />
          </button>
          <div className="lg:hidden">
            <Wordmark href={root} />
          </div>
          <p className="hidden text-small text-ink-muted lg:block" key={pathname}>
            {orgName}
          </p>
          <div className="ml-auto">
            <UserMenu name={user.name} email={user.email} roleLabel={user.roleLabel} />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 focus:outline-none md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
