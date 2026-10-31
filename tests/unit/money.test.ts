import { describe, expect, it } from "vitest";
import { currencyScale, dec, isValidMoneyString, roundMoney } from "@/lib/money";
import { formatMoney } from "@/lib/formatting";

describe("money", () => {
  it("avoids binary floating point errors", () => {
    expect(dec("0.1").plus("0.2").toString()).toBe("0.3");
  });

  it("rounds half-up to the currency minor unit", () => {
    expect(roundMoney("10.005", "INR").toFixed(2)).toBe("10.01");
    expect(roundMoney("10.004", "INR").toFixed(2)).toBe("10.00");
    expect(roundMoney("10.5", "JPY").toFixed(0)).toBe("11");
  });

  it("knows currency scales", () => {
    expect(currencyScale("INR")).toBe(2);
    expect(currencyScale("JPY")).toBe(0);
    expect(currencyScale("KWD")).toBe(3);
  });

  it("validates decimal input strings", () => {
    expect(isValidMoneyString("1200.50", "INR")).toBe(true);
    expect(isValidMoneyString("1200.505", "INR")).toBe(false);
    expect(isValidMoneyString("-5", "INR")).toBe(false);
    expect(isValidMoneyString("1e5", "INR")).toBe(false);
  });

  it("formats with locale grouping and currency code", () => {
    expect(formatMoney("1234567.5", { locale: "en-IN", currency: "INR" })).toBe("12,34,567.50 INR");
  });
});
