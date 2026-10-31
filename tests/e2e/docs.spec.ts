import { expect, test, type Page } from "@playwright/test";

/**
 * Opt-in helpers, skipped in CI:
 * - PERF=1 measures page-level p95/p99 for the AT-11 profile (run `npm run perf` first to seed it).
 * - SCREENSHOTS=1 regenerates the README screenshots in docs/screenshots.
 */
const PASSWORD = process.env.SEED_PASSWORD ?? "Recurivo#2026";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("AT-11 page timings on the 10k profile", async ({ page }) => {
  test.skip(!process.env.PERF, "set PERF=1");
  test.setTimeout(10 * 60_000);
  await signIn(page, "perf.admin@recurivo.test");
  const rows: string[] = [];
  for (const path of ["/app", "/app/insights", "/app/subscriptions", "/app/billing/invoices", "/app/billing/payments", "/app/subscriptions?q=PERF-0099"]) {
    await page.goto(path);
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      const res = await page.goto(path, { waitUntil: "load" });
      times.push(performance.now() - t);
      expect(res?.status()).toBe(200);
    }
    times.sort((a, b) => a - b);
    const p = (q: number) => times[Math.ceil(q * times.length) - 1].toFixed(0);
    rows.push(`| ${path} | ${p(0.5)} ms | ${p(0.95)} ms | ${p(0.99)} ms |`);
    expect(Number(p(0.95))).toBeLessThan(2000);
  }
  console.log(["| Page | p50 | p95 | p99 |", "|---|---|---|---|", ...rows].join("\n"));
});

test("README screenshots", async ({ page }) => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1");
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "admin@recurivo.test");
  for (const [path, file] of [["/app", "overview"], ["/app/subscriptions", "subscriptions"], ["/app/billing/invoices", "invoices"], ["/app/insights", "insights"]]) {
    await page.goto(path);
    await page.screenshot({ path: `docs/screenshots/${file}.png` });
  }
  await page.context().clearCookies();
  await signIn(page, "billing@acme.test");
  await page.screenshot({ path: "docs/screenshots/portal.png" });
});
