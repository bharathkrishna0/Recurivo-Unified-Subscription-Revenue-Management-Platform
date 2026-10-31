import { describe, expect, it } from "vitest";
import { checkPassword, normalizeEmail } from "@/lib/validation/password";
import { can, sanitizePermissions } from "@/lib/permissions";

describe("password rule (AUTH-02)", () => {
  it("accepts a compliant password", () => {
    expect(checkPassword("Ledger#2026").ok).toBe(true);
  });

  it.each([
    ["Short#1a", "At least 9 characters"],
    ["lowercase#only", "An uppercase letter"],
    ["UPPERCASE#ONLY", "A lowercase letter"],
    ["NoSpecials2026", "A special character"],
  ])("rejects %s", (pw, failure) => {
    const result = checkPassword(pw);
    expect(result.ok).toBe(false);
    expect(result.failures).toContain(failure);
  });

  it("requires more than eight characters", () => {
    expect(checkPassword("Abcdef#1").ok).toBe(false);
    expect(checkPassword("Abcdefg#1").ok).toBe(true);
  });

  it("normalizes email for uniqueness", () => {
    expect(normalizeEmail("  Asha@Example.COM ")).toBe("asha@example.com");
  });
});

describe("permissions", () => {
  it("grants admins everything", () => {
    expect(can({ role: "ADMIN", permissions: [] }, "payments.record")).toBe(true);
  });

  it("limits staff to granted permissions", () => {
    const staff = { role: "STAFF" as const, permissions: ["billing.manage"] };
    expect(can(staff, "billing.manage")).toBe(true);
    expect(can(staff, "payments.record")).toBe(false);
  });

  it("never grants customers staff permissions", () => {
    expect(can({ role: "CUSTOMER", permissions: ["payments.record"] }, "payments.record")).toBe(false);
  });

  it("drops unknown permission strings (mass assignment)", () => {
    expect(sanitizePermissions(["reports.view", "admin.all"])).toEqual(["reports.view"]);
  });
});
