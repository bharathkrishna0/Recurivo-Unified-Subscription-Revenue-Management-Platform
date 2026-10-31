import { inputClass } from "@/components/primitives/field";
import { buttonClass } from "@/components/primitives/button";
import { cn } from "@/lib/cn";

/** Server-rendered GET form: filters live in the URL so views are shareable. */
export function ListFilters({
  q,
  status,
  extra,
  searchLabel,
}: {
  q: string;
  status: string;
  extra?: React.ReactNode;
  searchLabel: string;
}) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
      <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-small font-semibold">
        {searchLabel}
        <input name="q" defaultValue={q} className={inputClass} type="search" />
      </label>
      <label className="flex flex-col gap-1.5 text-small font-semibold">
        Status
        <select name="status" defaultValue={status} className={cn(inputClass, "w-40")}>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="all">All</option>
        </select>
      </label>
      {extra}
      <button type="submit" className={buttonClass("secondary")}>
        Apply
      </button>
    </form>
  );
}
