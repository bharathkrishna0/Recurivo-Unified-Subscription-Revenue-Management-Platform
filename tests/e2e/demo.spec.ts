import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Opt-in README demo (skipped unless DEMO=1). Run against a freshly seeded, empty database:
 *   1. "demo subscriptions" creates customers and six months of subscriptions through the API;
 *      scripts/demo-billing.ts then replays the billing worker day by day;
 *      "demo payments" records payments on their historical dates, leaving some balances open.
 *   2. "README screenshots" captures docs/screenshots/*.png.
 *   3. "README walkthrough video" records the quote → invoice → partial payment → portal flow to test-results/.
 * scripts/demo-media.sh wraps all three and converts the recording to docs/media/.
 */
const PASSWORD = process.env.SEED_PASSWORD ?? "Recurivo#2026";
const DEMO = !!process.env.DEMO;
const VIEWPORT = { width: 1440, height: 900 };

test.describe.configure({ mode: "serial" });
test.skip(!DEMO, "set DEMO=1");

async function signIn(page: Page, email: string, typed = false) {
  await page.goto("/login");
  if (typed) {
    await page.getByLabel("Email").pressSequentially(email, { delay: 35 });
    await page.getByLabel("Password", { exact: true }).pressSequentially(PASSWORD, { delay: 35 });
  } else {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  }
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

type Json = Record<string, unknown> & { id: string };

function api(request: APIRequestContext, origin: string) {
  const call = async <T = Json>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> => {
    const res = await request.fetch(`/api/v1${path}`, { method, data: body, headers: { origin, ...headers } });
    const json = await res.json();
    if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${JSON.stringify(json)}`);
    return json.data as T;
  };
  return {
    get: <T = Json>(path: string) => call<T>("GET", path),
    post: <T = Json>(path: string, body: unknown, headers?: Record<string, string>) => call<T>("POST", path, body, headers),
  };
}

async function demoApi(page: Page, baseURL: string | undefined) {
  await signIn(page, "admin@recurivo.test");
  const v1 = api(page.request, new URL(baseURL!).origin);
  const customers = (await v1.get<{ rows: Json[] }>("/customers")).rows;
  const customer = (name: string) => customers.find((c) => c.businessName === name)!.id;
  return { v1, customers, customer };
}

test("demo subscriptions", async ({ page, baseURL }) => {
  test.skip(process.env.DEMO_DATA !== "subscriptions", "subscriptions step only");
  test.setTimeout(120_000);
  await signIn(page, "admin@recurivo.test");
  const v1 = api(page.request, new URL(baseURL!).origin);
  const existing = await v1.get<{ total: number }>("/subscriptions");
  test.skip(existing.total > 0, "database already has subscriptions; reseed an empty database first");

  for (const c of [
    { businessName: "Kestrel Analytics", contactName: "Divya Nair", email: "finance@kestrel.test", billingAddress: "Hyderabad, Telangana, India" },
    { businessName: "Meridian Foods", contactName: "Rohan Desai", email: "ap@meridian.test", billingAddress: "Pune, Maharashtra, India" },
  ]) {
    await v1.post("/customers", c);
  }
  const customers = (await v1.get<{ rows: Json[] }>("/customers")).rows;
  const plans = (await v1.get<{ rows: Json[] }>("/plans")).rows;
  const products = (await v1.get<{ rows: Json[] }>("/products")).rows;
  const discounts = await v1.get<Json[] | { rows: Json[] }>("/discount-rules");
  const discountList = Array.isArray(discounts) ? discounts : discounts.rows;
  const customer = (name: string) => customers.find((c) => c.businessName === name)!.id;
  const plan = (name: string) => plans.find((p) => p.name === name)!.id;
  const product = (name: string) => products.find((p) => p.name === name)!.id;
  const crm = await v1.get<{ variants: Json[] }>(`/products/${product("CRM Suite")}`);
  const odoo = crm.variants.find((v) => v.value === "Odoo")!.id;
  const annual = discountList.find((d) => d.name === "Annual commitment 10%")?.id;

  const subscribe = async (q: { customer: string; plan: string; start: string; lines: { product: string; variantId?: string; quantity: number }[]; discountRuleId?: string }, upTo: "send" | "activate" = "activate") => {
    const sub = await v1.post<{ id: string; version: number }>("/subscriptions", {
      customerId: customer(q.customer),
      planId: plan(q.plan),
      startDate: q.start,
      discountRuleId: q.discountRuleId,
      lines: q.lines.map((l) => ({ productId: product(l.product), variantId: l.variantId ?? null, quantity: l.quantity })),
    });
    for (const action of upTo === "send" ? ["send"] : ["send", "confirm", "activate"]) {
      await v1.post(`/subscriptions/${sub.id}/transitions`, { action });
    }
    return sub.id;
  };

  await subscribe({ customer: "Acme Retail LLP", plan: "CRM Monthly", start: "2026-05-01", lines: [{ product: "CRM Suite", quantity: 5 }] });
  await subscribe({ customer: "North Co. Logistics", plan: "CRM Yearly", start: "2026-04-15", lines: [{ product: "CRM Suite", quantity: 6 }], discountRuleId: annual });
  await subscribe({ customer: "North Co. Logistics", plan: "Support Monthly", start: "2026-08-01", lines: [{ product: "Priority Support", quantity: 1 }] });
  await subscribe({ customer: "Blueleaf Studios", plan: "Support Monthly", start: "2026-07-10", lines: [{ product: "Priority Support", quantity: 2 }] });
  await subscribe({ customer: "Kestrel Analytics", plan: "CRM Monthly", start: "2026-09-01", lines: [{ product: "CRM Suite", variantId: odoo, quantity: 8 }] });
  const meridian = await subscribe({ customer: "Meridian Foods", plan: "CRM Monthly", start: "2026-06-05", lines: [{ product: "CRM Suite", quantity: 2 }] });
  await subscribe({ customer: "Meridian Foods", plan: "Support Monthly", start: "2026-11-15", lines: [{ product: "Priority Support", quantity: 1 }] }, "send");

  console.log(`demo subscriptions: created; pause later: ${meridian}`);
});

test("demo payments", async ({ page, baseURL }) => {
  test.skip(process.env.DEMO_DATA !== "payments", "set DEMO_DATA=payments after scripts/demo-billing.ts");
  test.setTimeout(120_000);
  const { v1, customer } = await demoApi(page, baseURL);
  const subs = (await v1.get<{ rows: (Json & { customer: string; plan: string })[] }>("/subscriptions")).rows;
  const meridian = subs.find((s) => s.customer === "Meridian Foods" && s.plan === "CRM Monthly");
  if (meridian) {
    const sub = await v1.get<{ version: number }>(`/subscriptions/${meridian.id}`);
    await v1.post(`/subscriptions/${meridian.id}/transitions`, { action: "pause", expectedVersion: sub.version });
  }

  // Pay most invoices in full a few days after issue; leave a realistic mix of partial, open and overdue balances.
  type Inv = Json & { number: string; customer: string; customerId: string; total: string; issueDate: string };
  const invoices: Inv[] = [];
  for (let p = 1; ; p++) {
    const page = await v1.get<{ rows: Inv[]; total: number }>(`/invoices?page=${p}`);
    invoices.push(...page.rows.map((i) => ({ ...i, customerId: customer(i.customer) })));
    if (!page.rows.length || invoices.length >= page.total) break;
  }
  const leaveOpen = new Set<string>();
  const byCustomer = new Map<string, typeof invoices>();
  for (const inv of invoices) byCustomer.set(inv.customerId, [...(byCustomer.get(inv.customerId) ?? []), inv]);
  for (const list of byCustomer.values()) list.sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const latest = (name: string, back = 0) => {
    const list = byCustomer.get(customer(name)) ?? [];
    return list[list.length - 1 - back];
  };
  const partial = new Map<string, number>([
    [latest("Blueleaf Studios", 1)?.id, 0.4],
    [latest("Acme Retail LLP")?.id, 0.4],
  ]);
  for (const name of ["Blueleaf Studios", "Kestrel Analytics", "North Co. Logistics", "Meridian Foods"]) {
    const inv = latest(name);
    if (inv && !partial.has(inv.id)) leaveOpen.add(inv.id);
  }
  let n = 0;
  for (const inv of invoices) {
    if (leaveOpen.has(inv.id)) continue;
    const share = partial.get(inv.id) ?? 1;
    const amount = (Number(inv.total) * share).toFixed(2);
    const issued = new Date(inv.issueDate);
    issued.setUTCDate(issued.getUTCDate() + 6);
    const today = new Date().toISOString().slice(0, 10);
    const receivedOn = issued.toISOString().slice(0, 10) > today ? today : issued.toISOString().slice(0, 10);
    await v1.post(
      "/payments",
      { customerId: inv.customerId, method: n % 3 === 0 ? "UPI" : "BANK_TRANSFER", amount, receivedOn, reference: `UTR${(482_001_337 + n * 7919).toString()}`, allocations: [{ invoiceId: inv.id, amount }] },
      { "idempotency-key": `demo-${inv.id}` },
    );
    n++;
  }
  console.log(`demo payments: ${invoices.length} invoices, ${n} payments`);
});

test("README screenshots", async ({ page }) => {
  test.skip(!!process.env.DEMO_DATA, "data step");
  await page.setViewportSize(VIEWPORT);
  await signIn(page, "admin@recurivo.test");
  const shots: [string, string][] = [
    ["/app", "overview"],
    ["/app/catalog/products", "catalog"],
    ["/app/sales/quotations", "quotations"],
    ["/app/subscriptions", "subscriptions"],
    ["/app/billing/invoices", "invoices"],
    ["/app/billing/payments", "payments"],
    ["/app/insights", "insights"],
    ["/app/settings/audit", "audit"],
  ];
  for (const [path, file] of shots) {
    await page.goto(path);
    await page.screenshot({ path: `docs/screenshots/${file}.png` });
  }
  await page.goto("/app/billing/invoices?status=OVERDUE");
  await page.getByRole("link", { name: /^INV-/ }).first().click();
  await page.waitForURL(/\/app\/billing\/invoices\/.+/);
  await page.screenshot({ path: "docs/screenshots/invoice.png" });

  await page.context().clearCookies();
  await signIn(page, "billing@acme.test");
  await page.screenshot({ path: "docs/screenshots/portal.png" });
  await page.goto("/portal/billing");
  await page.screenshot({ path: "docs/screenshots/portal-billing.png" });
});

async function caption(page: Page, text: string, hold = 1600) {
  await page.evaluate((t) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      el.setAttribute("aria-hidden", "true");
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)", zIndex: "2147483647",
        background: "rgba(17,17,17,0.92)", color: "#fff", font: "500 15px/1.4 Inter, system-ui, sans-serif",
        padding: "10px 18px", borderRadius: "6px", letterSpacing: "0.01em", pointerEvents: "none", maxWidth: "80%", textAlign: "center",
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
  await page.waitForTimeout(hold);
}

test("README walkthrough video", async ({ browser, baseURL }) => {
  test.skip(!!process.env.DEMO_DATA, "data step");
  test.setTimeout(5 * 60_000);
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, recordVideo: { dir: "test-results/demo-video", size: { width: 1280, height: 800 } } });
  const page = await context.newPage();
  const pause = (ms = 900) => page.waitForTimeout(ms);

  await page.goto("/login");
  await caption(page, "Recurivo: subscriptions, recurring invoices and payments in one ledger", 2200);
  await signIn(page, "admin@recurivo.test", true);
  await caption(page, "Overview: what needs attention today, in the organization's currency and time zone", 2600);

  await page.getByRole("link", { name: "Catalog" }).first().click();
  await page.getByRole("link", { name: "CRM Suite" }).first().click();
  await page.waitForURL(/\/catalog\/products\/.+/);
  await caption(page, "Catalog: CRM Suite with an Odoo variant that adds a fixed 560 to the base price", 2400);

  await page.goto("/app/sales/quotations/new");
  await caption(page, "New quotation: prices are always calculated on the server", 1600);
  await page.getByLabel("Customer").selectOption({ label: "Acme Retail LLP" });
  await pause(500);
  await page.getByLabel("Plan").selectOption({ label: "CRM Monthly" });
  await pause(500);
  await page.getByLabel("Product").first().selectOption({ label: "CRM Suite" });
  await pause(500);
  await page.getByLabel("Variant").first().selectOption({ label: "Brand: Odoo" });
  await pause(500);
  await page.getByLabel("Quantity").first().fill("3");
  await page.getByRole("button", { name: "Preview totals" }).click();
  await expect(page.getByText("Total per period")).toBeVisible();
  await page.getByText("Total per period").scrollIntoViewIfNeeded();
  await caption(page, "3 seats × (2,000 + 560) + 18% GST = 9,062.40 per month", 2800);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/app\/subscriptions\/[^/]+\?saved=1/);
  await caption(page, "Saved as a draft quotation, with its number and an audit trail", 1800);

  for (const label of ["Send quotation", "Confirm quotation", "Activate subscription"]) {
    await page.getByRole("button", { name: label }).click();
    await pause(700);
    await page.getByRole("button", { name: `Confirm: ${label.toLowerCase()}` }).click();
    await page.waitForURL(/done=/);
    await caption(page, `${label.replace(" quotation", "").replace(" subscription", "")}: each lifecycle step is checked on the server and logged`, 1500);
  }
  await caption(page, "The subscription is active; its first bill date is today", 1800);

  await page.goto("/app/billing/invoices");
  await page.getByRole("button", { name: "Run billing now" }).click();
  await pause(700);
  await page.getByRole("button", { name: "Confirm: run billing now" }).click();
  await page.waitForLoadState("networkidle");
  await caption(page, "Billing run: one invoice per period, even if workers run concurrently", 2200);
  await page.getByRole("link", { name: /^INV-/ }).first().click();
  await page.waitForURL(/\/app\/billing\/invoices\/.+/);
  const number = (await page.getByRole("heading", { level: 1 }).textContent())!.replace("Invoice ", "").trim();
  await caption(page, `${number}: lines and totals are frozen when the invoice is issued`, 2400);

  await page.goto("/app/billing/payments/new");
  await page.getByLabel("Customer").selectOption({ label: "Acme Retail LLP" });
  await page.getByRole("button", { name: "Show open invoices" }).click();
  await page.waitForURL(/customerId=/);
  await caption(page, "Record a manual payment and choose which invoices it pays", 1600);
  await page.getByLabel("Amount received").pressSequentially("3624.96", { delay: 60 });
  await page.getByLabel("Reference").pressSequentially("UTR 2026103100421", { delay: 30 });
  await page.getByLabel(`Amount to apply to ${number}`).pressSequentially("3624.96", { delay: 60 });
  await caption(page, `40% of ${number} received by bank transfer`, 1600);
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.waitForURL(/\/app\/billing\/payments\/.+/);
  await caption(page, "Payment recorded and allocated; retries with the same key never double-count", 2200);

  await page.goto("/app/billing/invoices");
  await page.getByRole("link", { name: number }).click();
  await caption(page, "The invoice is now Partially paid, with 60% still due", 2600);

  await page.goto("/app/insights");
  await caption(page, "Insights: billed, collected, outstanding, overdue, MRR and ARR from the same ledger", 2600);
  await page.mouse.wheel(0, 700);
  await caption(page, "Every chart has a table with the same numbers, and every CSV export is audited", 2600);

  await page.context().clearCookies();
  await signIn(page, "billing@acme.test", true);
  await caption(page, "Customer portal: Acme sees only its own subscriptions, invoices and balances", 2600);
  await page.getByRole("link", { name: "Invoices & payments" }).first().click();
  await page.waitForURL(/\/portal\/billing/);
  await caption(page, `${number} shows the same 60% balance the finance team sees`, 2600);
  await page.getByRole("link", { name: number }).first().click();
  await page.waitForURL(/\/portal\/billing\/invoices\/.+/);
  await caption(page, "Recurivo: one traceable record from quotation to cash", 2800);

  await context.close();
});
