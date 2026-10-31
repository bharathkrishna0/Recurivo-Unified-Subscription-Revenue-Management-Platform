"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";

export function UserMenu({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex h-10 items-center gap-2 rounded-control px-2 text-body hover:bg-surface-hover data-[state=open]:bg-surface-pressed"
        aria-label={`Account menu for ${name}`}
      >
        <span className="flex size-7 items-center justify-center rounded-full border border-line-strong text-micro font-semibold" aria-hidden>
          {name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{name}</span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-60 rounded-panel border border-line bg-surface p-1 shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
        >
          <div className="px-3 py-2">
            <p className="text-body font-semibold">{name}</p>
            <p className="text-small text-ink-muted">{email}</p>
            <p className="text-micro text-ink-subtle">{roleLabel}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <form action={signOutAction}>
            <DropdownMenu.Item asChild>
              <button type="submit" className="flex h-9 w-full items-center rounded-control px-3 text-left text-body outline-none data-[highlighted]:bg-surface-hover">
                Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
