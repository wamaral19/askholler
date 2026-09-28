# Holler

Holler is an evidence-backed customer research operations platform for Shopify ecommerce merchants. The current repository contains the technical foundation and a deterministic synthetic MVP slice.

## What works now

- Strict TypeScript workspace with Shopify's React Router application foundation and a separate worker entrypoint.
- Minimal, validated Shopify order ingress and provider-neutral commerce normalization.
- Extensible, versioned cohort predicate registry with tri-state evaluation and current-category predicates.
- Tenant-scoped PostgreSQL repositories for commerce events, qualification, assignments, interviews/evidence, Angles, reports, audit records, and durable jobs.
- Atomic, optimistic assignment claim/start transitions with append-only transition records; qualification never starts an interview or call.
- Fake dialer and transcription providers.
- Versioned research fields, transcript evidence, researcher observations, and AI/human provenance rules.
- Validated evidence-backed Angles and deterministic monthly HTML Disco rendering (the code still uses the generic `Report` domain name).
- React Router loaders/actions backed by a PostgreSQL operations service for Research Moments, queue claim/start/release, pinned interview definitions, protected phone reveal, interview capture, completion, and report generation.
- A development-only synthetic workforce-session adapter and replaceable synthetic phone decryptor, with tenant-scoped, claim-gated and audited reveal.
- Transactional `report.render.requested` application-outbox events for the worker integration branch.
- PostgreSQL/Drizzle schema and migrations for the initial domain.

All fixtures and UI data are synthetic. Do not introduce production customer PII into development, logs, prompts, fixtures, screenshots, or source control.

## Local setup

Requirements:

- Node.js 22+
- npm 11+
- PostgreSQL 17+ for migration/persistence work

```bash
npm install
cp .env.example .env.local
npm run typecheck
npm test
npm run build
```

Run the fast in-memory synthetic vertical slice:

```bash
npm run demo:synthetic
```

Run the persisted canonical checks against an isolated schema in a disposable PostgreSQL database:

```bash
TEST_DATABASE_URL=postgresql://localhost/holler_test npm run demo:synthetic:persisted
```

The persisted command migrates a newly created schema, seeds the canonical scenario idempotently, verifies its records/provenance, then drops only that schema. It skips explicitly when neither `TEST_DATABASE_URL` nor `DATABASE_URL` is set.

Run the prototype UI:

```bash
npm run dev
```

Run the embedded Shopify surface against the linked development app/store:

```bash
npx shopify app dev --store hollers-test-store-version-zero.myshopify.com
```

Shopify CLI supplies the app credentials and tunnel URL to the React Router
process. `DATABASE_URL` must point to a running PostgreSQL database. Shopify
sessions are stored durably in that database by the official PostgreSQL session
adapter. The app must have development access to protected customer data before
Shopify will activate the `orders/create` subscription and the `read_orders` /
`read_customers` scopes.

Credential-free readiness checks are part of the normal suite:

```bash
npm test -- packages/shopify apps/worker/src/worker.test.ts
npm run typecheck
```

For a real development-store check, use only synthetic customers and orders:

1. Run migrations and start the worker in a second terminal with `npm run dev:worker`.
2. Start `shopify app dev` and approve only the scopes in `shopify.app.toml`.
3. Confirm the embedded `/app` page displays the expected shop domain.
4. Create one synthetic test order, then replay its `orders/create` delivery from Shopify's developer tools.
5. Confirm the invalid-signature case is rejected, the replay is deduplicated, and neither process logs the webhook body or customer contact fields.
6. Uninstall the app and confirm its stored Shopify sessions are removed.

The repository cannot prove protected-customer-data approval, delivery from Shopify's infrastructure, or historical API access without a Partner app and development store. Those remain external launch checks. The current webhook route authenticates and acknowledges Shopify callbacks, but durable `orders/create` persistence and bounded history reconciliation remain implementation work; do not treat a successful install as ingestion readiness.

The UI fails closed unless `HOLLER_OPERATIONS_MODE` is explicitly selected. Use `synthetic-postgres` with `DATABASE_URL` for the durable path. `synthetic-memory` exists only for isolated development/tests and is never an implicit fallback. Supply an opaque `holler_workforce_session` cookie (or `x-holler-workforce-session` in tests) mapped by `HOLLER_SYNTHETIC_WORKFORCE_SESSIONS`; merchant, researcher, and role grants come only from that server-side map. The commerce dashboard at `/admin/dashboard` requires `merchant_admin` or `platform_admin`.

This session adapter is intentionally non-production and replaceable at the context boundary. Production OIDC/MFA, workforce membership/role storage and revocation, KMS-backed phone encryption, legal approval for outbound contact/recording, reveal rate limits/alerting, and live providers remain launch blockers. Synthetic mode is not completed production authentication or encryption.

## Deployment

Production runs on Render (web service + PostgreSQL, defined in `render.yaml`) behind Cloudflare DNS. `withholler.com` serves only the landing page; `app.withholler.com` serves Shopify, Twilio, and workforce routes. The worker, operations UI, and live calls are intentionally not enabled yet. Setup, DNS records, and provider URLs are in `docs/deployment.md`.

## Database

Set `DATABASE_URL` to an isolated local/test PostgreSQL database, then run:

```bash
npm run db:migrate
```

Generate a migration after an intentional schema change:

```bash
npm run db:generate
```

Never point development commands at a production database.

Report requests create or identify a report/revision and insert an outbox event in the same transaction. The worker-facing contract is `eventType=report.render.requested`, `schemaVersion=1`, `aggregateType=report_revision`; payload fields are `reportId`, `reportRevisionId`, ISO `periodStart`, ISO `periodEnd`, and `format=html`. The stable idempotency key is `report.render.requested:<reportId>:1`. The Graphile branch may map this to `render_report`; this branch does not dispatch it.

## Repository structure

```text
apps/web          React Router operational UI and future Shopify app surface
apps/worker       Background worker process
packages/domain   Shared runtime schemas, value types, states, and ports
packages/db       Drizzle schema and migrations
packages/shopify  Shopify ingress boundary and normalization
packages/research Cohort predicates, qualification, and assignment queue
packages/providers Fake dialer/transcription adapters and provider ports
packages/evidence Interview responses, transcript evidence, and observations
packages/reporting Angles, report validation, and HTML rendering
packages/testkit  Canonical synthetic end-to-end flow
docs              Architecture, data model, plan, security review, and demo contract
```

## Product deliverables

- **Earshot:** the reporting package now validates and renders deterministic weekly CSVs from pinned columns and reviewed rows, neutralizes spreadsheet formulas, and exposes same-tenant admin/private-store/audit contracts. Database assembly, scheduling, and signed-download delivery remain to be wired.
- **Disco:** monthly evidence-backed synthesis of what changed, why, supporting customer conversations, and recommended actions. The current generic report renderer is its technical foundation.
- **Angles:** individual evidence-backed findings assembled inside a Disco, not a separate customer deliverable.

## Next implementation boundary

Finish durable worker orchestration and development-store verification, then wire the Earshot generator to reviewed PostgreSQL evidence, a weekly job, and private signed-download delivery. Before a live pilot, replace synthetic workforce/PII adapters, complete protected-data approval and legal review, and integrate production dialer/transcription providers. The detailed ordered backlog is in `docs/mvp-plan.md`.
