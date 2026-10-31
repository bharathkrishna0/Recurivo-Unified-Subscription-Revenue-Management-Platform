import { describe, expect, it } from "vitest";
import { addMonthsClamped, billingPeriod, formatDateOnly, parseDateOnly, todayIn } from "@/lib/dates";

const d = parseDateOnly;
const f = formatDateOnly;

describe("addMonthsClamped (end-of-month rule)", () => {
  it("clamps 31 Jan to the last day of February", () => {
    expect(f(addMonthsClamped(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(f(addMonthsClamped(d("2028-01-31"), 1))).toBe("2028-02-29");
  });

  it("restores the anchor day when computed from the original anchor", () => {
    expect(f(addMonthsClamped(d("2026-01-31"), 2))).toBe("2026-03-31");
    expect(f(addMonthsClamped(d("2026-01-31"), 3))).toBe("2026-04-30");
  });

  it("crosses year boundaries", () => {
    expect(f(addMonthsClamped(d("2026-11-15"), 3))).toBe("2027-02-15");
  });
});

describe("billingPeriod", () => {
  it("computes contiguous monthly periods", () => {
    const p0 = billingPeriod(d("2026-01-31"), "MONTHLY", 0);
    const p1 = billingPeriod(d("2026-01-31"), "MONTHLY", 1);
    expect([f(p0.start), f(p0.end)]).toEqual(["2026-01-31", "2026-02-27"]);
    expect([f(p1.start), f(p1.end)]).toEqual(["2026-02-28", "2026-03-30"]);
  });

  it("handles leap-day yearly anchors", () => {
    const p1 = billingPeriod(d("2028-02-29"), "YEARLY", 1);
    expect(f(p1.start)).toBe("2029-02-28");
  });

  it("supports daily and weekly intervals", () => {
    expect(f(billingPeriod(d("2026-03-01"), "WEEKLY", 2).start)).toBe("2026-03-15");
    expect(f(billingPeriod(d("2026-03-01"), "DAILY", 1).end)).toBe("2026-03-02");
  });
});

describe("parseDateOnly / todayIn", () => {
  it("rejects impossible dates", () => {
    expect(() => parseDateOnly("2026-02-30")).toThrow();
    expect(() => parseDateOnly("2026-2-3")).toThrow();
  });

  it("uses the business timezone, not the server timezone", () => {
    const instant = new Date("2026-10-31T20:00:00Z");
    expect(f(todayIn("Asia/Kolkata", instant))).toBe("2026-11-01");
    expect(f(todayIn("America/New_York", instant))).toBe("2026-10-31");
  });
});
