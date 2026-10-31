# Recurivo

[![CI](https://github.com/bharathkrishna0/Recurivo-Unified-Subscription-Revenue-Management-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/bharathkrishna0/Recurivo-Unified-Subscription-Revenue-Management-Platform/actions/workflows/ci.yml)

**Subscription and recurring-revenue management for teams that have outgrown spreadsheets.**

Recurivo (*Recurring* + *Vivo*) gives finance and sales teams one traceable record from quotation to cash: products and plans, server-priced quotations, subscription lifecycles, recurring invoices, manual payments with partial allocation, a customer self-service portal and live revenue reporting — with every change written to an audit log.

[![Recurivo walkthrough: quotation, billing, partial payment and customer portal](docs/media/recurivo-demo.gif)](docs/media/recurivo-demo.mp4)

<sub>58-second walkthrough recorded with Playwright against a production build on a Linux VM, using the seeded demo data. Click for the full-quality MP4.</sub>

## Contents

- [Highlights](#highlights)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Getting started](#getting-started-windows-no-docker)
- [Demo walkthrough](#demo-walkthrough)
- [Quality and verification](#quality-and-verification)
- [Scripts](#scripts)
- [Engineering decisions](#engineering-decisions)
- [Known limitations](#known-limitations)

## Highlights

| Area | What it does |
|---|---|
| **Catalog** | Products with priced variants (e.g. CRM Suite 2,000 + Odoo variant 560), versioned recurring plans, tax rules and admin-only discount rules. |
| **Sales** | Quotation templates and quotations priced entirely on the server; any price sent by the browser is ignored. |
| **Subscriptions** | Draft → sent → confirmed → active, with pause, resume, close, withdraw and renew. Every transition is permission-checked and logged. |
| **Billing** | A background worker issues invoices on each bill date. Billing the same period twice is prevented by the database, not just the code. |
| **Payments** | Manual payments (bank transfer, UPI, card via an external terminal, cheque, cash) applied across invoices, with partial payments, reversals and idempotent retries. |
| **Customer portal** | Customers see only their own subscriptions, invoices, PDFs and receipts, and can accept quotations or request plan-permitted changes. |
| **Insights** | Billed, collected, outstanding and overdue amounts, MRR and ARR, filterable by period, plan, customer and status; CSV exports are audited. |
| **Governance** | Role-based access (administrator, staff profiles, customer), Argon2id passwords, rate-limited sign-in and a complete audit log. |

## Screenshots

All screenshots use the seeded demo organization with six months of generated billing history.

| Overview | Insights |
|---|---|
| ![Overview: active subscriptions, billed, collected and outstanding amounts](docs/screenshots/overview.png) | ![Insights: revenue summary, MRR/ARR and billed vs collected by month](docs/screenshots/insights.png) |
| **Catalog — product variants** | **Quotations** |
| ![Catalog: CRM Suite with the Odoo variant](docs/screenshots/catalog.png) | ![Quotations list](docs/screenshots/quotations.png) |
| **Subscriptions** | **Billing — invoices** |
| ![Subscriptions list with lifecycle states](docs/screenshots/subscriptions.png) | ![Invoices with paid, partially paid and overdue states](docs/screenshots/invoices.png) |
| **Invoice detail** | **Payments** |
| ![Invoice detail with lines, tax and balance due](docs/screenshots/invoice.png) | ![Recorded payments and allocations](docs/screenshots/payments.png) |
| **Customer portal — home** | **Customer portal — invoices and payments** |
| ![Customer portal home](docs/screenshots/portal.png) | ![Customer portal invoices and payments](docs/screenshots/portal-billing.png) |
| **Audit log** | |
| ![Audit log](docs/screenshots/audit.png) | |

Screenshots and the video are reproducible: see [Regenerating the media](#regenerating-the-screenshots-and-video).

## Architecture

```text
 Browser ──► Next.js 16 App Router (TypeScript strict)
              ├─ server-rendered pages + server actions
              └─ REST API  /api/v1/*
                     │
                     ▼
              Domain services (catalog, sales, billing, payments, reports, audit)
                     │  decimal.js money · organization-timezone calendar dates
                     ▼
              PostgreSQL (Prisma) ◄──── Node worker
               system of record          ├─ billing cycles (FOR UPDATE SKIP LOCKED)
               + transactional outbox    └─ outbox delivery: invoice emails + PDFs
```

- **Modular monolith**: one deployable web app plus one worker process. No Redis or message broker — the worker coordinates through Postgres row locks and a transactional outbox.
- **Stack**: Next.js 16, React 19, Prisma 6 on PostgreSQL 14+, Tailwind CSS 4, PDFKit, Nodemailer, Vitest, Playwright with axe-core.
- **Design system**: "Quiet Ledger" — monochrome, Inter only, tabular numerals for money, hairline dividers instead of cards, one primary action per page, and statuses communicated by wording and weight rather than color. Tokens live in `src/styles/tokens.css`.

## Getting started (Windows, no Docker)

Requirements: Node.js 20.9+ (22 LTS recommended) and PostgreSQL 14+.

1. Install PostgreSQL for Windows (EDB installer) or inside WSL (`sudo apt install postgresql`), then create the database. In PowerShell:

   ```powershell
   psql -U postgres -c "CREATE USER recurivo WITH PASSWORD 'recurivo' CREATEDB;"
   psql -U postgres -c "CREATE DATABASE recurivo OWNER recurivo;"
   ```

2. Configure and install:

   ```powershell
   Copy-Item .env.example .env
   npm install
   npm run db:migrate
   npm run db:seed
   ```

3. Start the app and the worker in two terminals:

   ```powershell
   npm run dev      # http://localhost:3000
   npm run worker   # runs billing cycles every minute and delivers queued emails/invoices
   ```

Docker users can run `docker compose up -d db` instead of step 1.

### Demo accounts

All seeded accounts use the password `Recurivo#2026` (override with `SEED_PASSWORD` before seeding). These are demo credentials only — never seed a production database.

| Email | Role |
|---|---|
| admin@recurivo.test | Administrator |
| finance@recurivo.test | Staff — finance lead profile |
| sales@recurivo.test | Staff — sales profile |
| billing@acme.test | Customer — Acme Retail LLP (portal) |
| accounts@northco.test | Customer — North Co. Logistics (portal) |

With `MAIL_TRANSPORT=sandbox`, emails such as invoices and password-reset links are stored in Postgres and listed at http://localhost:3000/dev/mailbox (disabled in production).

## Demo walkthrough

This is the flow shown in the video above:

1. **Catalog** — sign in as `admin@recurivo.test`. *Catalog → CRM Suite* shows the Odoo variant adding a fixed 560 to the 2,000 base price.
2. **Quotation** — *Sales → New quotation*: Acme Retail LLP, CRM Monthly, CRM Suite (Brand: Odoo) × 3. *Preview totals* returns the server-calculated price: 3 × 2,560 + 18% GST = **9,062.40 INR** per month.
3. **Lifecycle** — save the draft, then send, confirm and activate it. Each step is validated on the server and appears in the activity log.
4. **Billing** — *Billing → Run billing now* issues the invoice; running it again creates no duplicate. The PDF and email appear in `/dev/mailbox`.
5. **Partial payment** — record 3,624.96 INR (40%) against the invoice under *Billing → Payments*. The invoice becomes *Partially paid* with 5,437.44 INR due.
6. **Customer view** — sign in as `billing@acme.test`: the portal shows the same invoice, balance and receipt, and nothing belonging to other customers.
7. **Reporting** — *Insights* reconciles billed, collected and outstanding amounts; every CSV export is recorded under *Settings → Audit log*.

## Quality and verification

| Check | Coverage |
|---|---|
| Unit tests (`npm test`) | Pricing, rounding, date arithmetic (end-of-month clamping), validation and permissions |
| Database tests (`npm run test:integration`) | Concurrency and idempotency against real Postgres: parallel billing runs, duplicate sign-ups, discount usage limits, payment replays, outbox delivery |
| Browser tests (`npm run e2e`) | Playwright journeys for staff and customers with automated axe accessibility checks |
| Acceptance scenarios | AT-01 to AT-12 from the PRD, mapped to tests in [docs/hardening.md](docs/hardening.md) |
| Performance | With 10,000 subscriptions, 30,000 invoices and 20,000 payments, the slowest page (Insights) measured 143 ms at p95 against a 2 s target, on an 8 vCPU VM with Postgres on the same host |
| Restore drill | `scripts/restore-drill.sh` restores a backup into a fresh database and reconciles subscription, invoice and payment totals |

CI runs lint, type checks, the production build, unit, database and browser tests on every pull request. Results, methodology and remaining gaps are documented in [docs/hardening.md](docs/hardening.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run worker` | Background worker: billing cycles (`BILLING_INTERVAL_MS`, default 60s) and outbox delivery |
| `npm run lint` / `typecheck` | ESLint / route type generation + `tsc --noEmit` |
| `npm test` | Unit tests (no database) |
| `npm run test:integration` | Database tests (needs `DATABASE_URL`) |
| `npm run test:all` | Unit and database tests |
| `npm run e2e` | Playwright journeys with axe accessibility checks against `npm run start` (run `npm run build` first; `CHROME_PATH` selects a local Chrome, otherwise `npx playwright install chromium`) |
| `npm run perf` | AT-11 profile: seeds 10,000 subscriptions in a separate organization and reports p50/p95/p99 |
| `scripts/restore-drill.sh` | AT-12 backup/restore drill with reconciliation (`PG_EXEC="docker exec -i recurivo-pg"` for Docker) |
| `scripts/demo-media.sh` | Regenerates the README screenshots and walkthrough video (see below) |
| `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations / seed demo data / reset |

### Regenerating the screenshots and video

The media is produced by `tests/e2e/demo.spec.ts`, which builds six months of history through the public API (and `scripts/demo-billing.ts`, which replays the billing worker day by day so invoices keep their real issue dates), then captures the screenshots and records the walkthrough. Use a separate, freshly seeded database: the data step skips itself when the database already has subscriptions.

```bash
# bash / WSL; needs ffmpeg and `npx playwright install ffmpeg`
export DATABASE_URL="postgresql://recurivo:recurivo@localhost:5432/recurivo_demo"
npm run db:migrate && npm run db:seed && npm run build
npm run start &        # serves the demo database on http://localhost:3000
scripts/demo-media.sh  # writes docs/screenshots/*.png and docs/media/recurivo-demo.{mp4,gif}
```

## Engineering decisions

- **Money** is `NUMERIC(18,4)` in Postgres and `decimal.js` in code, rounded half-up to the currency's minor unit. No floating point.
- **Billing dates** are calendar dates in the organization timezone. Monthly/yearly periods are always computed from the original start date with an end-of-month clamp (31 Jan → 28/29 Feb → 31 Mar).
- **No double billing**: `UNIQUE(subscriptionId, periodStart)` on billing cycles plus a partial unique index allowing one non-cancelled invoice per cycle. Integration tests run concurrent inserts against both.
- **Side effects** (emails, later webhooks) are written to an outbox table in the same transaction as the business change and delivered by the worker with retries and backoff.
- **Authorization** is enforced on the server for every page, server action and API route. The UI hides controls only for clarity. Records outside a user's scope return "not found".
- **Auth**: Argon2id password hashes; database-backed sessions in an HttpOnly, SameSite=Lax cookie (Secure in production); Postgres-backed rate limits on login, registration and reset; single-use reset tokens hashed at rest that expire after 30 minutes and revoke existing sessions; same-origin checks on cookie-authenticated API writes.
- **Password rule** (from the brief): more than eight characters with uppercase, lowercase and a special character. Minimum length is configurable per organization.


## Billing

- The worker bills every active subscription whose next bill date has arrived (in the organization's time zone). Each cycle claims the subscription row with `FOR UPDATE SKIP LOCKED`; `UNIQUE(subscriptionId, periodStart)` and a partial unique index on active invoices per cycle make retries and concurrent workers safe. Missed periods are caught up on the next run.
- Invoice lines copy the subscription's agreed quantities and unit prices; taxes in effect on the period start are applied, and the subscription's discount is applied only if it is still valid and a usage slot can be claimed atomically.
- Invoices are issued as Confirmed and emailed with a PDF through the outbox. Failed sends and failed cycles appear under Billing → Exceptions.
- Payments are recorded manually and applied to open invoices (partial payments allowed). Reversals restore balances; a paid invoice must have its payments reversed before it can be cancelled.
- Admins (or staff with `billing.manage`) can trigger a run from Billing → Invoices → Run billing now.

## Known limitations

- **Payments are manual.** There is no payment-gateway integration, so signed webhook handling and provider reconciliation (PRD AT-09) are not implemented. Recording the same manual payment twice is already safe.
- **Point-in-time recovery** depends on WAL archiving in the production Postgres deployment; the included restore drill works from a full backup.
- **Accessibility** is checked automatically with axe-core in CI. Manual screen-reader and zoom testing has not been done yet.
- **MFA for administrators** (AUTH-07) is not implemented.
- **Defaults pending product confirmation**: one organization per deployment; currency and timezone set per organization (seeded as INR / Asia/Kolkata); no discount stacking; paused subscriptions do not create billing cycles.
- `npm audit` reports moderate advisories in development-only lint tooling; production dependencies report none.
