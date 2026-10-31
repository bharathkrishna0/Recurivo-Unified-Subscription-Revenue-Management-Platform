import { z } from "zod";

export const MONEY_RE = /^\d{1,14}(\.\d{1,4})?$/;
const SIGNED_MONEY_RE = /^-?\d{1,14}(\.\d{1,4})?$/;

const blank = (v: unknown) => (v === "" || v === null ? undefined : v);

/** Treat empty form inputs as "not provided". */
export const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

export const money = (message = "Enter an amount, e.g. 1200.00") => z.string().trim().regex(MONEY_RE, message);
export const signedMoney = (message = "Enter an amount, e.g. 560 or -100") => z.string().trim().regex(SIGNED_MONEY_RE, message);
export const percent = (message = "Enter a percentage between 0 and 100") =>
  z.string().trim().regex(/^\d{1,3}(\.\d{1,4})?$/, message).refine((v) => Number(v) <= 100, message);

export const dateOnly = (message = "Enter a date") =>
  z.iso.date(message).transform((s) => new Date(`${s}T00:00:00Z`));

export const wholeNumber = (min: number, message: string) => z.coerce.number().int(message).min(min, message).max(1_000_000, message);

export const PAGE_SIZE = 25;

export function pageOf(raw: unknown): number {
  const n = Number(typeof raw === "string" ? raw : 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function textParam(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 100) : "";
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
