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
- Validated evidence-backed Angles and deterministic monthly HTML report rendering.
- React Router loaders/actions behind an injectable operations service for Research Moments, cohort construction, queue claim/start, protected phone reveal/manual dialing, live interview capture, completion, and report generation.
- A development-only synthetic private-customer adapter with claim-gated, short-lived, audited phone reveal.
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

The UI is wired to an injectable application-service boundary and uses a local synthetic adapter by default. PostgreSQL repositories now exist, but production composition, workforce authentication, Shopify authentication/webhooks, a real PII encryption/KMS adapter, and real provider calls remain deliberately out of scope.

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

Durable jobs use the PostgreSQL `durable_jobs` table, idempotency keys, retry state, and `FOR UPDATE SKIP LOCKED` claims. The worker handler registry that connects live Shopify normalization to qualification remains a follow-on adapter; current persisted verification seeds the synthetic facts directly.

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

## Next implementation boundary

Wire the currently in-memory synthetic slice to PostgreSQL repositories and durable jobs, then connect UI actions to those services with workforce authentication and tenant authorization. Shopify installation/webhook handling and a real dialer remain separate adapters behind the established contracts.
