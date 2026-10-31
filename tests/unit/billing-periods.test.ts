import { describe, expect, it } from "vitest";
import { billingPeriod, parseDateOnly, periodIndexAt } from "@/lib/dates";

const d = (s: string) => parseDateOnly(s);

describe("periodIndexAt", () => {
  it("finds the period that starts on a given bill date, keeping the month-end anchor", () => {
    expect(periodIndexAt(d("2026-01-31"), "MONTHLY", d("2026-01-31"))).toBe(0);
    expect(periodIndexAt(d("2026-01-31"), "MONTHLY", d("2026-02-28"))).toBe(1);
    expect(periodIndexAt(d("2026-01-31"), "MONTHLY", d("2026-03-31"))).toBe(2);
    expect(billingPeriod(d("2026-01-31"), "MONTHLY", 1).end.toISOString().slice(0, 10)).toBe("2026-03-30");
  });

  it("handles daily, weekly and leap-year yearly anchors", () => {
    expect(periodIndexAt(d("2026-01-01"), "DAILY", d("2026-03-01"))).toBe(59);
    expect(periodIndexAt(d("2026-01-01"), "WEEKLY", d("2026-01-15"))).toBe(2);
    expect(periodIndexAt(d("2024-02-29"), "YEARLY", d("2025-02-28"))).toBe(1);
    expect(periodIndexAt(d("2024-02-29"), "YEARLY", d("2028-02-29"))).toBe(4);
  });
});
