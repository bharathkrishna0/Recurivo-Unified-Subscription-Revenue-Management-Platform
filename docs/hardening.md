# Hardening report (milestone 6)

How each release acceptance scenario from the PRD is verified, plus the performance, restore,
accessibility and dependency checks. Re-run everything with the commands below.

## Acceptance scenarios

| ID | Scenario | Verified by |
|---|---|---|
| AT-01 | Two sign-ups with the same email in different case | `tests/integration/acceptance.test.ts` — three concurrent registrations, exactly one account, others `CONFLICT` |
| AT-02 | Staff invites an employee or creates a discount | `catalog-settings.test.ts` — "only lets administrators invite", "lets only administrators create discounts, logging staff attempts" |
| AT-03 | Odoo +560 variant chosen at quote creation | `acceptance.test.ts` — preview total equals the billed invoice (3 × 2,560 + 18% = 9,062.40); invoice line keeps the variant; invoice is audited |
| AT-04 | Monthly plan activated 31 January | `billing-engine.test.ts` — periods 31 Jan, 28 Feb, 31 Mar, none missed; `dates.test.ts` end-of-month clamping |
| AT-05 | Two workers bill the same period | `billing-engine.test.ts` (4 concurrent runs → 1 cycle, 1 invoice); `db-guarantees.test.ts` unique constraints |
| AT-06 | Worker crashes after commit | `billing-engine.test.ts` — rerun observes the existing cycle; `db-guarantees.test.ts` outbox delivers each event once across workers |
| AT-07 | Final discount use claimed concurrently | `billing-engine.test.ts` — usage limit never exceeded |
| AT-08 | 40% partial payment | `billing-payments.test.ts` — 60% balance, invoice not Paid |
| AT-09 | Payment event delivered twice / out of order | Partially: manual payments are idempotent by key (`billing-payments.test.ts`, replay returns the original payment). Payment gateways and signed webhooks are not built yet, so provider reconciliation is out of scope. |
| AT-10 | Customer edits the invoice ID in the URL | `billing-payments.test.ts`, `portal-insights.test.ts` (safe 404), Playwright `journeys.spec.ts` |
| AT-11 | 10,000 subscriptions, p95 under 2 s | `tests/perf/at11.test.ts` and `tests/e2e/docs.spec.ts` — results below |
| AT-12 | Restore from backup reconciles | `scripts/restore-drill.sh` — results below |

## AT-11 performance profile

`npm run perf` seeds a separate organization, "Recurivo Perf Profile" (sign-in `perf.admin@recurivo.test`, seed password), once:
10,000 subscriptions (80% active, 10% paused, 10% closed; daily/weekly/monthly/yearly plans), 300 customers,
30,000 invoices (two paid, one open per subscription) and 20,000 payments with allocations. `PERF_RESET=1` reseeds it.
Each query runs 30 times after a warm-up. Machine: 8 vCPU, 31 GB RAM, PostgreSQL 16 in Docker on the same host.

Server-side queries (service layer, `npm run perf`):

| Query | p50 | p95 | p99 |
|---|---|---|---|
| Insights, default 6 months | 35 ms | 132 ms | 139 ms |
| Insights, 12 months filtered by plan | 22 ms | 130 ms | 132 ms |
| Subscriptions list, page 1 | 9 ms | 13 ms | 16 ms |
| Subscriptions search by number | 14 ms | 24 ms | 33 ms |
| Invoices list, page 1 | 25 ms | 25 ms | 36 ms |
| Invoices search by customer | 34 ms | 40 ms | 40 ms |
| Portal subscriptions (33 records) | 3 ms | 4 ms | 4 ms |
| Portal invoices (100 records) | 5 ms | 5 ms | 8 ms |

Full pages through the production build in Chrome, 20 loads each (`PERF=1 npm run e2e -- tests/e2e/docs.spec.ts`):

| Page | p50 | p95 | p99 |
|---|---|---|---|
| /app (Overview) | 77 ms | 91 ms | 107 ms |
| /app/insights | 124 ms | 143 ms | 225 ms |
| /app/subscriptions | 84 ms | 95 ms | 96 ms |
| /app/billing/invoices | 103 ms | 113 ms | 148 ms |
| /app/billing/payments | 80 ms | 93 ms | 98 ms |
| /app/subscriptions?q=PERF-0099 | 91 ms | 103 ms | 119 ms |

Background work (not user-facing, no 2 s target): one due-billing batch of 1,000 subscriptions took 11.0 s
(1,000 invoiced, 0 failed, about 11 ms per invoice including tax, numbering, audit and outbox writes);
the 6-month invoice CSV export (about 31,000 rows) took 2.5 s.

## AT-12 restore drill

`scripts/restore-drill.sh` takes a `pg_dump -Fc`, restores it into a scratch database and compares counts and sums
of subscriptions, invoices (total and paid), payments, allocations and audit events. With Docker:
`PG_EXEC="docker exec -i recurivo-pg" scripts/restore-drill.sh`.

Result on the 10k profile database (about 85,000 financial rows, 1.7 MB dump): dump under 1 s, restore 2 s, all totals reconcile.

- RTO for this size: 2 s restore plus app restart.
- RPO with nightly logical dumps: up to 24 hours. For production, true point-in-time restore needs WAL archiving
  (for example a managed PostgreSQL with PITR, or `pg_basebackup` plus `archive_command`). That brings RPO down to
  minutes, and the drill should then run against a PITR restore.

## Accessibility (WCAG 2.2 AA)

- `tests/e2e/journeys.spec.ts` runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules) on sign-in, Overview, Subscriptions,
  Billing, Insights, the audit log and every portal page. Any serious or critical violation fails CI.
- Fixed: the account menu button had an `aria-label` that did not contain its visible text (WCAG 2.5.3 Label in Name).
  It is now named by its content.
- Covered by design and code review: one `h1` per page, skip-to-content link, visible focus rings, a table alongside the
  Insights chart, status shown as text rather than color, labelled form fields with linked errors, and confirmation
  dialogs that trap and return focus.
- Still needs a person: screen-reader passes (NVDA, VoiceOver) and 200% and 400% zoom checks on the quotation editor
  and the payment allocation form.

## Dependencies

- `npm audit --omit=dev`: 0 vulnerabilities. `deepmerge-ts` (pulled in by `prisma` → `@prisma/config`) is pinned to
  `^8.0.2` with an npm override. Prisma validate, generate, migrations and all tests pass with it.
- Remaining: 16 moderate findings, all `minimatch <11.0.1` inside ESLint and typescript-eslint. These are dev-only
  lint tools that never run in production or on user input. They clear when ESLint and typescript-eslint ship
  releases on minimatch 11. `npm audit fix --force` would apply breaking major-version changes to the lint toolchain, so it is not used.
