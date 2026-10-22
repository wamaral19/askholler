# Holler

Holler provides point-in-time, human customer research for DTC ecommerce brands. Shopify events qualify customers into targeted Research Angles so Holler can learn why they bought while the context is fresh, then turn the conversations into evidence-backed reports. The repository contains the technical foundation and a deterministic synthetic MVP slice.

Product intent is governed by the verbatim [`docs/working-backwards-document.md`](docs/working-backwards-document.md), with [`docs/working-backwards-source-of-truth.md`](docs/working-backwards-source-of-truth.md) recording its implementation interpretation and product-owner resolutions. `HOLLER_DEV_BRIEF.md` and the remaining documents supply implementation, security, and operating detail only where they do not conflict with the WBD and those resolutions.

## What works now

- Strict TypeScript workspace with Shopify's React Router application foundation and a separate worker entrypoint.
- Minimal, validated Shopify order ingress and provider-neutral commerce normalization.
- Extensible, versioned cohort predicate registry with tri-state evaluation and current-category predicates.
- Tenant-scoped PostgreSQL repositories for commerce events, qualification, assignments, interviews/evidence, Angles, reports, audit records, and durable jobs.
- Atomic, optimistic assignment claim/start transitions with append-only transition records; qualification never starts an interview or call.
- Fake dialer and transcription providers.
- Versioned research fields, transcript evidence, researcher observations, and AI/human provenance rules.
- Validated evidence-backed findings and deterministic monthly HTML report rendering.
- React Router loaders/actions backed by a PostgreSQL operations service for Research Moments, queue claim/start/release, pinned interview definitions, protected phone reveal, interview capture, completion, and report generation.
- A development-only synthetic workforce-session adapter and replaceable synthetic phone decryptor, with tenant-scoped, claim-gated and audited reveal.
- Transactional `render_report` application-outbox events (`merchantId`, `reportRevisionId`) dispatched to Graphile Worker.
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

Run the embedded Shopify surface against the development app (`Holler Dev`,
`shopify.app.dev.toml`) and store. `shopify.app.toml` is the production app;
never run `shopify app dev` against it.

```bash
npx shopify app dev --config dev --store hollers-test-store-version-zero.myshopify.com
```

Shopify CLI supplies the app credentials and tunnel URL to the React Router
process. `DATABASE_URL` must point to a running PostgreSQL database. Shopify
sessions are stored durably in that database by the official PostgreSQL session
adapter. The app must have development access to protected customer data before
Shopify will include customer name and phone in `orders/create` payloads.

Credential-free readiness checks are part of the normal suite:

```bash
npm test -- packages/shopify apps/worker
npm run typecheck
```

For a real development-store check, use only synthetic customers and orders:

1. Run migrations and start the worker in a second terminal with `npm run dev:worker`.
2. Start `shopify app dev --config dev` and approve only the scopes in `shopify.app.dev.toml`.
3. Confirm the embedded `/app` page opens on Research runs.
4. Create one synthetic test order, then replay its `orders/create` delivery from Shopify's developer tools.
5. Confirm the invalid-signature case is rejected, the replay is deduplicated, and neither process logs the webhook body or customer contact fields.
6. Uninstall the app and confirm its stored Shopify sessions are removed.

The repository cannot prove protected-customer-data approval, delivery from Shopify's infrastructure, or historical API access without a Partner app and development store. Those remain external launch checks. The current webhook route authenticates and acknowledges Shopify callbacks, but durable `orders/create` persistence and bounded history reconciliation remain implementation work; do not treat a successful install as ingestion readiness.

The UI fails closed unless `HOLLER_OPERATIONS_MODE` is explicitly selected. Use `synthetic-postgres` with `DATABASE_URL` for the durable path. `synthetic-memory` exists only for isolated development/tests and is never an implicit fallback. Supply an opaque `holler_workforce_session` cookie (or `x-holler-workforce-session` in tests) mapped by `HOLLER_SYNTHETIC_WORKFORCE_SESSIONS`; merchant, researcher, and role grants come only from that server-side map. The commerce dashboard at `/admin/dashboard` requires `merchant_admin` or `platform_admin`. A session may list extra `merchantIds` to allow switching merchants from the sidebar; the `holler_workforce_merchant` cookie only selects among those. Pausing, completing, or reopening a moment requires `research_manager`, `merchant_admin`, or `platform_admin`. Only live moments (stored as `active`) qualify new orders into the queue.

This session adapter is intentionally non-production and replaceable at the context boundary. Production OIDC/MFA, workforce membership/role storage and revocation, KMS-backed phone encryption, reveal rate limits/alerting, and live providers remain launch blockers. Synthetic mode is not completed production authentication or encryption.

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

Graphile Worker is the only background execution engine. Application transactions write opaque-ID-only records to `outbox_events`; the worker's bounded dispatcher claims committed rows with `FOR UPDATE SKIP LOCKED`, calls `graphile_worker.add_job` in the same transaction, and only then marks each row dispatched. Stable Graphile job keys make a crash/replay converge on one logical job. The historical `durable_jobs` table remains only for forward-compatible data preservation and has no runtime consumer.

The explicit task registry contains `normalize_webhook`, `evaluate_commerce_event`, `expire_assignments`, and `render_report`. Their service ports currently fail closed with `JOB_SERVICE_UNAVAILABLE` until the corresponding Shopify, research, assignment-expiry, and reporting compositions are added. Payloads contain only merchant and resource UUIDs; payload validation and a recursive sensitive-key denylist run before publication and execution.

Worker configuration requires `DATABASE_URL` and accepts `WORKER_CONCURRENCY`, `WORKER_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, `OUTBOX_POLL_INTERVAL_MS`, and `WORKER_SHUTDOWN_TIMEOUT_MS`. It does not require web-only settings such as `APP_BASE_URL`.

To replay a stranded event, first inspect and correct its safe event type/payload, then clear `outbox_events.dispatched_at`. The dispatcher republishes it under the same task-specific job key. Graphile's replacement semantics prevent a second logical job. Never copy a row to replay it or alter its idempotency identity.

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

## Product vocabulary and deliverables

- **Research Angle:** a customer segment plus a question or hypothesis and its prioritized interview questions. The current implementation calls its executable configuration a `ResearchMoment`.
- **Monthly report:** the starting $1,000 subscription includes 25 completed interviews, two hours of consented audio recordings, an executive summary, tagged-conversation visualizations, learnings and anecdotes, recommended actions/experiments, and transcripts plus authorized links.
- **Quarterly report:** a longer synthesis included with the monthly subscription; there is no separate quarterly subscription.
- **Standalone Research Run report:** the output of a one-time, Angle-led engagement.

The existing generic `Report` and evidence models are the technical foundation. Earlier repository terms **Earshot** and **Disco** are retired product names, though some code and historical docs may still carry them during migration.

## Next implementation boundary

Finish durable worker orchestration and development-store verification. Before a live pilot, replace synthetic workforce/PII adapters with Google sign-in for the internal team and KMS encryption, complete protected-data approval for a custom-distribution Shopify app, and enable compliant human outreach/calling. The first reports may be assembled manually. The pilot uses direct calls without SMS; text invitations remain a post-pilot target. The ordered backlog is in `docs/mvp-plan.md`.
