import { describe, expect, it } from "vitest";
import { availableActions, checkTransition, isQuoteExpired, nextBillDateOnOrAfter, termEndDate, type LifecycleSubject } from "@/lib/lifecycle";
import { parseDateOnly as d } from "@/lib/dates";

const base: LifecycleSubject = {
  status: "DRAFT",
  quoteValidUntil: null,
  endDate: null,
  hasRenewal: false,
  plan: { allowPause: true, allowEarlyClose: false, allowRenewal: true },
};
const today = d("2026-10-31");
const at = (patch: Partial<LifecycleSubject>) => ({ ...base, ...patch });

describe("subscription lifecycle", () => {
  it("walks the happy path one step at a time", () => {
    expect(checkTransition("send", base, today)).toEqual({ ok: true, to: "QUOTATION" });
    expect(checkTransition("confirm", at({ status: "QUOTATION", quoteValidUntil: today }), today)).toEqual({ ok: true, to: "CONFIRMED" });
    expect(checkTransition("activate", at({ status: "CONFIRMED" }), today)).toEqual({ ok: true, to: "ACTIVE" });
    expect(checkTransition("pause", at({ status: "ACTIVE" }), today)).toEqual({ ok: true, to: "PAUSED" });
    expect(checkTransition("resume", at({ status: "PAUSED" }), today)).toEqual({ ok: true, to: "ACTIVE" });
  });

  it("rejects skipped steps", () => {
    expect(checkTransition("activate", base, today).ok).toBe(false);
    expect(checkTransition("confirm", base, today).ok).toBe(false);
    expect(checkTransition("activate", at({ status: "ACTIVE" }), today).ok).toBe(false);
    expect(checkTransition("send", at({ status: "CLOSED" }), today).ok).toBe(false);
  });

  it("will not confirm an expired quotation", () => {
    const quote = at({ status: "QUOTATION", quoteValidUntil: d("2026-10-30") });
    expect(isQuoteExpired(quote, today)).toBe(true);
    expect(checkTransition("confirm", quote, today)).toMatchObject({ ok: false, reason: expect.stringMatching(/expired/) });
  });

  it("enforces plan policy for pause and early close", () => {
    const strict = { allowPause: false, allowEarlyClose: false, allowRenewal: false };
    expect(checkTransition("pause", at({ status: "ACTIVE", plan: strict }), today).ok).toBe(false);
    expect(checkTransition("close", at({ status: "ACTIVE", plan: strict, endDate: d("2027-01-31") }), today).ok).toBe(false);
    expect(checkTransition("close", at({ status: "ACTIVE", plan: strict, endDate: d("2026-10-30") }), today).ok).toBe(true);
    expect(checkTransition("close", at({ status: "ACTIVE", plan: { ...strict, allowEarlyClose: true } }), today).ok).toBe(true);
  });

  it("renews only fixed-term contracts once", () => {
    expect(checkTransition("renew", at({ status: "ACTIVE" }), today).ok).toBe(false);
    expect(checkTransition("renew", at({ status: "ACTIVE", endDate: d("2027-01-31") }), today)).toEqual({ ok: true, to: "ACTIVE" });
    expect(checkTransition("renew", at({ status: "ACTIVE", endDate: d("2027-01-31"), hasRenewal: true }), today).ok).toBe(false);
  });

  it("lists only the actions that would pass", () => {
    expect(availableActions(at({ status: "ACTIVE" }), today)).toEqual(["pause"]);
    expect(availableActions(base, today)).toEqual(["send", "cancel"]);
  });
});

describe("schedule helpers", () => {
  it("computes the last day of a fixed term", () => {
    expect(termEndDate(d("2026-01-31"), "MONTHLY", 12).toISOString().slice(0, 10)).toBe("2027-01-30");
    expect(termEndDate(d("2026-11-01"), "YEARLY", 1).toISOString().slice(0, 10)).toBe("2027-10-31");
  });

  it("skips periods missed during a pause and keeps the anchor day", () => {
    expect(nextBillDateOnOrAfter(d("2026-01-31"), "MONTHLY", d("2026-03-05"), null)?.toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(nextBillDateOnOrAfter(d("2026-01-31"), "MONTHLY", d("2026-01-31"), null)?.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(nextBillDateOnOrAfter(d("2026-01-01"), "MONTHLY", d("2026-12-15"), d("2026-12-31"))).toBeNull();
  });
});
