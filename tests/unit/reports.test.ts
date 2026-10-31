import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { monthlyRecurring, monthsBetween } from "@/lib/metrics";
import { customerActions, type LifecycleSubject } from "@/lib/lifecycle";
import { parseDateOnly } from "@/lib/dates";

describe("csv", () => {
  it("neutralises spreadsheet formulas but keeps numbers numeric", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-5.25")).toBe("-5.25");
    expect(csvCell("Acme, Inc")).toBe('"Acme, Inc"');
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});

describe("metrics", () => {
  it("normalises recurring amounts to a month", () => {
    expect(monthlyRecurring("1200", "YEARLY").toFixed(2)).toBe("100.00");
    expect(monthlyRecurring("100", "WEEKLY").toFixed(2)).toBe("433.33");
    expect(monthlyRecurring("10", "DAILY").toFixed(2)).toBe("304.17");
    expect(monthsBetween(parseDateOnly("2025-11-15"), parseDateOnly("2026-02-01"))).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("customerActions", () => {
  const base = (status: LifecycleSubject["status"], selfService: boolean) => ({
    status,
    quoteValidUntil: null,
    endDate: null,
    hasRenewal: false,
    plan: { allowPause: true, allowEarlyClose: true, allowRenewal: true, customerSelfService: selfService },
  });
  const today = parseDateOnly("2026-10-31");
  it("lets customers accept quotations and use only self-service actions", () => {
    expect(customerActions(base("QUOTATION", false), today)).toEqual(["confirm"]);
    expect(customerActions(base("ACTIVE", false), today)).toEqual([]);
    expect(customerActions(base("ACTIVE", true), today)).toEqual(["pause", "close"]);
    expect(customerActions(base("CONFIRMED", true), today)).toEqual([]);
  });
});
