# Recurivo

Recurivo combines *Recurring* and *Vivo* (life): one traceable workflow for subscription plans, quotations, recurring invoices, payments, balances and revenue reporting.

It is a modular monolith: a Next.js (App Router, TypeScript strict) web app with a versioned REST API under `/api/v1`, PostgreSQL as the system of record (Prisma), and a separate Node worker for background jobs. No Redis is required — the worker coordinates through Postgres row locks (`FOR UPDATE SKIP LOCKED`) and a transactional outbox.

## Status

Delivered milestone by milestone, one pull request each:

| # | Milestone | State |
|---|---|---|
| 1 | Foundations: schema, design system, AppShell, auth/RBAC, outbox worker, seed, CI | done |
| 2 | Catalog & settings: products/variants, plans, taxes, discounts, staff invitations | done |
| 3 | Sales & subscriptions: customers, templates, quotations, server-side pricing, lifecycle | this branch |
| 4 | Billing: idempotent cycle worker, invoices, PDF/email, payments, exceptions | planned |
| 5 | Customer portal, Overview, Insights, CSV export, audit log | planned |
| 6 | Hardening: acceptance tests AT-01–AT-11, 10k performance check, accessibility | planned |

## Run locally (Windows, no Docker)

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
   npm run worker   # delivers queued emails (and, later, billing runs)
   ```

Docker users can run `docker compose up -d db` instead of step 1.

### Demo accounts

All seeded accounts use the password `Recurivo#2026` (override with `SEED_PASSWORD` before seeding). Demo data only — never seed a production database.

| Email | Role |
|---|---|
| admin@recurivo.test | Administrator |
| finance@recurivo.test | Staff — finance lead profile |
| sales@recurivo.test | Staff — sales profile |
| billing@acme.test | Customer (portal) |

With `MAIL_TRANSPORT=sandbox`, emails such as password-reset links are stored in Postgres and listed at http://localhost:3000/dev/mailbox (disabled in production).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run worker` | Background worker (outbox delivery) |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Unit tests (no database) |
| `npm run test:integration` | Database tests (needs `DATABASE_URL`) |
| `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations / seed demo data / reset |

## Design decisions

- **Money** is `NUMERIC(18,4)` in Postgres and `decimal.js` in code, rounded half-up to the currency's minor unit. No floating point.
- **Billing dates** are calendar dates in the organization timezone. Monthly/yearly periods are always computed from the original start date with an end-of-month clamp (31 Jan → 28/29 Feb → 31 Mar).
- **No double billing**: `UNIQUE(subscriptionId, periodStart)` on billing cycles plus a partial unique index allowing one non-cancelled invoice per cycle. Integration tests run concurrent inserts against both.
- **Side effects** (emails, later webhooks) are written to an outbox table in the same transaction as the business change and delivered by the worker with retries and backoff.
- **Authorization** is enforced on the server for every page, server action and API route. The UI hides controls only for clarity. Records outside a user's scope return "not found".
- **Auth**: Argon2id password hashes; database-backed sessions in an HttpOnly, SameSite=Lax cookie (Secure in production); Postgres-backed rate limits on login, registration and reset; single-use reset tokens hashed at rest that expire after 30 minutes and revoke existing sessions; same-origin checks on cookie-authenticated API writes.
- **Password rule** (from the brief): more than eight characters with uppercase, lowercase and a special character. Minimum length is configurable per organization.

### Open assumptions (from the PRD, pending confirmation)

One organization per deployment; currency and timezone set per organization (seeded as INR / Asia/Kolkata); manual payments only; no discount stacking; paused subscriptions do not create billing cycles. MFA for administrators (AUTH-07) is not implemented yet.

## Design system

"Quiet Ledger": monochrome, Inter only (self-hosted variable font in `public/fonts`, SIL Open Font License), tabular numerals for money, hairline dividers instead of cards, one primary action per page, statuses communicated by wording and weight rather than color. Tokens live in `src/styles/tokens.css`.
