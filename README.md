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

The UI fails closed unless `HOLLER_OPERATIONS_MODE` is explicitly selected. Use `synthetic-postgres` with `DATABASE_URL` for the durable path. `synthetic-memory` exists only for isolated development/tests and is never an implicit fallback. Supply an opaque `holler_workforce_session` cookie (or `x-holler-workforce-session` in tests) mapped by `HOLLER_SYNTHETIC_WORKFORCE_SESSIONS`; merchant and researcher IDs come only from that server-side map.

This session adapter is intentionally non-production and replaceable at the context boundary. Production OIDC/MFA, workforce membership/role storage and revocation, KMS-backed phone encryption, legal approval for outbound contact/recording, reveal rate limits/alerting, and live providers remain launch blockers. Synthetic mode is not completed production authentication or encryption.

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

## Next implementation boundary

Wire the currently in-memory synthetic slice to PostgreSQL repositories and durable jobs, then connect UI actions to those services with workforce authentication and tenant authorization. Shopify installation/webhook handling and a real dialer remain separate adapters behind the established contracts.
