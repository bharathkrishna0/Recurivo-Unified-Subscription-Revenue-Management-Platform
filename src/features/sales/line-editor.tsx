"use client";

import { useState } from "react";
import { Button } from "@/components/primitives/button";
import { inputClass } from "@/components/primitives/field";
import { cn } from "@/lib/cn";

export interface ProductOption {
  id: string;
  name: string;
  variants: { id: string; attribute: string; value: string }[];
}

export interface EditorLine {
  productId: string;
  variantId: string | null;
  quantity: number;
}

interface Row extends EditorLine {
  key: number;
}

let seq = 0;
const toRows = (lines: EditorLine[]): Row[] => lines.map((l) => ({ ...l, key: ++seq }));

/**
 * Editable product/variant/quantity rows. Prices are not entered here: the
 * server prices every line from the catalog. `computed` shows the last
 * server preview for each row.
 */
export function useLineRows(initial: EditorLine[]) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initial.length ? initial : [{ productId: "", variantId: null, quantity: 1 }]));
  return { rows, setRows, replace: (lines: EditorLine[]) => setRows(toRows(lines)) };
}

export function LineEditor({
  rows,
  setRows,
  products,
  errors,
  computed,
}: {
  rows: Row[];
  setRows: (rows: Row[]) => void;
  products: ProductOption[];
  errors?: Record<string, string>;
  computed?: { total: string }[];
}) {
  const update = (key: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const lineError = errors ? Object.entries(errors).find(([k]) => k === "lines")?.[1] : undefined;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-body font-semibold">Lines</legend>
      <input type="hidden" name="lines" value={JSON.stringify(rows.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })))} />
      {lineError ? (
        <p className="text-small font-semibold" role="alert">
          {lineError}
        </p>
      ) : null}
      {rows.map((row, i) => {
        const product = products.find((p) => p.id === row.productId);
        const err = (f: string) => errors?.[`lines.${i}.${f}`];
        const ids = { product: `line-${row.key}-product`, variant: `line-${row.key}-variant`, qty: `line-${row.key}-qty` };
        return (
          <div key={row.key} className="grid gap-3 border-b border-line pb-3 md:grid-cols-[2fr_2fr_7rem_auto_auto] md:items-end">
            <label htmlFor={ids.product} className="flex flex-col gap-1.5 text-small font-semibold">
              Product
              <select
                id={ids.product}
                value={row.productId}
                aria-invalid={!!err("productId")}
                onChange={(e) => update(row.key, { productId: e.target.value, variantId: null })}
                className={cn(inputClass, "pr-8")}
              >
                <option value="">Choose a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {err("productId") ? <span className="font-normal">{err("productId")}</span> : null}
            </label>
            <label htmlFor={ids.variant} className="flex flex-col gap-1.5 text-small font-semibold">
              Variant
              <select
                id={ids.variant}
                value={row.variantId ?? ""}
                disabled={!product?.variants.length}
                aria-invalid={!!err("variantId")}
                onChange={(e) => update(row.key, { variantId: e.target.value || null })}
                className={cn(inputClass, "pr-8")}
              >
                <option value="">{product?.variants.length ? "Base price" : "No variants"}</option>
                {product?.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.attribute}: {v.value}
                  </option>
                ))}
              </select>
              {err("variantId") ? <span className="font-normal">{err("variantId")}</span> : null}
            </label>
            <label htmlFor={ids.qty} className="flex flex-col gap-1.5 text-small font-semibold">
              Quantity
              <input
                id={ids.qty}
                type="number"
                min={1}
                inputMode="numeric"
                value={row.quantity}
                aria-invalid={!!err("quantity")}
                onChange={(e) => update(row.key, { quantity: Number(e.target.value) })}
                className={inputClass}
              />
              {err("quantity") ? <span className="font-normal">{err("quantity")}</span> : null}
            </label>
            <span className="tabular h-10 content-center text-right text-body md:min-w-28" aria-label={`Line ${i + 1} total`}>
              {computed?.[i]?.total ?? ""}
            </span>
            <Button type="button" variant="tertiary" size="sm" disabled={rows.length === 1} onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>
              Remove<span className="sr-only"> line {i + 1}</span>
            </Button>
          </div>
        );
      })}
      <div>
        <Button type="button" variant="secondary" size="sm" disabled={rows.length >= 50} onClick={() => setRows([...rows, { key: ++seq, productId: "", variantId: null, quantity: 1 }])}>
          Add line
        </Button>
      </div>
    </fieldset>
  );
}
