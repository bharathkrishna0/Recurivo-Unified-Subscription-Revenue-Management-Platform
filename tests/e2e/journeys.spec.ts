import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PASSWORD = process.env.SEED_PASSWORD ?? "Recurivo#2026";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** WCAG 2.2 AA automated check: no serious or critical violations on critical screens. */
async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("sign-in page is accessible and keyboard operable", async ({ page }) => {
  await page.goto("/login");
  await expectAccessible(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("administrator reaches every finance screen", async ({ page }) => {
  await signIn(page, "admin@recurivo.test");
  await expect(page).toHaveURL(/\/app$/);
  for (const [path, heading] of [
    ["/app", /Overview/],
    ["/app/subscriptions", /Subscriptions/],
    ["/app/billing/invoices", /Billing/],
    ["/app/insights", /Insights/],
    ["/app/settings/audit", /Settings/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expectAccessible(page);
  }
  const download = page.waitForEvent("download");
  await page.goto("/app/insights");
  await page.getByRole("link", { name: "Export invoices" }).click();
  expect((await download).suggestedFilename()).toMatch(/^recurivo-invoices-.*\.csv$/);
});

test("sales staff without reports.view is kept out of Insights", async ({ page }) => {
  await signIn(page, "sales@recurivo.test");
  await page.goto("/app/insights");
  await expect(page).toHaveURL(/denied=1/);
});

test("customer sees only their own portal records", async ({ page }) => {
  await signIn(page, "billing@acme.test");
  await expect(page).toHaveURL(/\/portal$/);
  for (const path of ["/portal", "/portal/subscriptions", "/portal/billing", "/portal/account", "/portal/help"]) {
    await page.goto(path);
    await expectAccessible(page);
  }
  const res = await page.goto("/portal/billing/invoices/not-a-real-invoice");
  expect(res?.status()).toBe(404);
  const staff = await page.goto("/app");
  expect(new URL(staff!.url()).pathname).not.toBe("/app");
});
