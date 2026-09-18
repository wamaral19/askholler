# Holler MVP Architecture

## Status and scope

This document began as the greenfield architecture and was updated after the synthetic foundation implementation. The repository now contains the React Router web role, worker entrypoint, Drizzle schema/migrations, modular domain packages, PostgreSQL repositories and durable job primitives, fake providers, and deterministic synthetic flows. Production workforce authentication, live Shopify integration, real providers, and deployment remain unimplemented boundaries.

The MVP proves one evidence-traceable path:

```text
Shopify order (or synthetic equivalent)
  -> verified ingress receipt
  -> normalized CommerceEvent
  -> deterministic qualification
  -> ResearchAssignment
  -> human researcher queue and interview
  -> transcript segments and evidence-backed tags
  -> Angle
  -> monthly Angles Report
```

It deliberately excludes MMM, autonomous interviewers, a broad customer BI dashboard, complex anomaly detection, and non-Shopify commerce integrations.

## Architecture decisions

### Application shape: modular monolith

Start with one TypeScript codebase deployed as two process roles:

- **Web:** Shopify auth and webhooks, internal researcher/analyst UI, and server-side APIs.
- **Worker:** durable asynchronous jobs for normalization, qualification, reconciliation, transcription callbacks/polling, retention, and report rendering.

The processes share a PostgreSQL database but communicate through committed database records and jobs, not in-memory calls. Domain modules own their tables and public service interfaces. This gives the MVP transactional integrity and simple operations while keeping seams that can become services later if load or organizational needs justify it.

### Proposed baseline stack

Because no stack exists, the recommended baseline is:

- TypeScript in a workspace-based repository with strict compiler settings.
- Shopify's official React Router application scaffold for the HTTP surface, embedded merchant setup, and internal operational UI. Use its official auth/token-exchange primitives; do not hand-roll OAuth or token validation.
- PostgreSQL as the system of record.
- Drizzle ORM plus SQL migrations. Drizzle keeps SQL constraints and PostgreSQL features visible; the schema remains the authority rather than generated application types alone.
- A PostgreSQL-backed worker such as Graphile Worker. The exact library is confirmed in Milestone 0 with a spike, but the domain depends only on a `JobDispatcher` port.
- S3-compatible private object storage for audio and generated report artifacts; database rows hold opaque object keys, never public URLs.
- Vitest for unit/service tests, Testing Library for components, and Playwright for the synthetic end-to-end flow.
- Structured JSON logging with an explicit PII denylist/redaction layer and request/job correlation IDs.

These choices are proposed, not existing conventions. Pin exact versions only when scaffolding begins.

### Deployment model

Use container-compatible Node processes and managed infrastructure:

```text
Internet / Shopify
        |
        v
  HTTPS web process  -----> private object storage
        |                         ^
        v                         |
 managed PostgreSQL <------ worker process
        |
        +---- transactional outbox / durable jobs
```

Required environments are `development`, `test`, `staging`, and `production`, with separate databases, buckets, app credentials, and encryption keys. The initial platform vendor remains an explicit Milestone 0 decision. The design must run locally with PostgreSQL and fake providers, and must not require real customer data or live calls.

## Module boundaries

### 1. Shopify app/auth and commerce ingestion

The `shopify` adapter owns installation, token exchange/OAuth, minimum scopes, app-uninstall handling, Admin GraphQL calls, webhook subscription configuration, and historical/reconciliation sync. Store offline tokens encrypted in a dedicated credential table, inaccessible to browser code and ordinary researcher roles.

For every HTTPS webhook:

1. Capture the exact raw body.
2. Verify the HMAC before trusting headers or payload.
3. Resolve the merchant only after verification.
4. insert an immutable `WebhookReceipt` using Shopify's delivery ID as a unique key.
5. Return success quickly after the receipt and normalization job are durably committed.

Never log bodies, phone numbers, emails, names, addresses, tokens, or raw query parameters. Use app-configured subscriptions and implement required privacy topics (`customers/data_request`, `customers/redact`, and `shop/redact`) before production distribution. Shopify recommends delivery-ID deduplication, raw-body HMAC verification, and reconciliation because delivery is not guaranteed; those are launch requirements, not optional hardening.

### 2. Webhooks and normalized CommerceEvents

`WebhookReceipt` is an ingress audit record; `CommerceEvent` is a provider-neutral domain fact. Normalization upserts current commerce projections (`Customer`, `Order`, and line items) and inserts a versioned event snapshot in one retry-safe transaction.

The raw payload should not be kept by default because it can contain unnecessary PII. If short-lived encrypted quarantine is needed for debugging, it must have a narrow access path and automatic expiry. The normalized event stores only fields needed for qualification/audit plus an allowlisted `observedAttribution` snapshot. A unique `(merchant_id, source, source_event_id)` constraint and deterministic normalization make replay safe.

Event ordering is not assumed. Source occurrence/update timestamps and ingestion timestamps are distinct. A reconciliation cursor periodically fetches recently changed Shopify resources and sends them through the same normalization service.

### 3. Commerce/customer data model

The `commerce` module owns non-sensitive customer identity, orders, line items, observed attribution, and normalized events. External IDs are scoped by merchant. Money uses integer minor units plus ISO currency; timestamps are UTC instants, with merchant timezone used only for presentation and reporting boundaries.

`observedAttribution` is a typed snapshot with a retained allowlisted raw fragment for forward compatibility. It is never populated from interview answers. Self-reported attribution is an evidence-backed interview tag/value in the research module.

### 4. Protected customer PII storage

The `privacy` module owns `CustomerPrivate` and the only decrypting service. It stores minimal encrypted fields (initially given name and E.164 phone, with email only if a documented flow requires it), blind indexes only where an equality lookup is essential, key version, consent/contact eligibility metadata, and expiry/deletion state.

Application-level envelope encryption uses a managed KMS in production. Database backups and object storage remain encrypted independently. Researcher views receive a display name and masked phone only; call initiation passes a customer ID to the server-side telephony adapter, which resolves the number inside the PII boundary. Every decrypt is authorized and audit logged. No PII is permitted in fixtures, source, logs, prompts, traces, analytics, screenshots, or report artifacts.

### 5. Research Moment definitions

The `research-moments` module owns merchant-scoped, versioned definitions. A published `ResearchMomentVersion` is immutable and includes event type, objective, cohort-expression JSON, priority, allocation policy, active interval, script version, and research-field-set version. Editing creates a draft/new version; historical assignments retain the published version used.

The cohort expression is a recursive `all`/`any`/`not` tree of code-registered, versioned predicates. Each predicate owns its validated JSON configuration, tenant-scoped evaluator, safe parameterized query plan, and human-readable description. Adding custom logic therefore does not require changing the Research Moment schema or immediately adding GUI controls. Arbitrary user-authored SQL is not allowed.

Initial predicates cover first/repeat or exact order sequence, order value, current product category, prior-order/current-category transitions, SKU/product, observed source, phone/contact eligibility, event age, and cooldown. Predicates return `match`, `no_match`, or `unknown`; incomplete history or catalog enrichment fails closed with an auditable reason.

Product categories are current catalog classifications, not order-time snapshots. Recategorizing a product changes future cohort evaluation over historical orders. Existing qualification evaluations and assignments preserve the predicate versions, result, and relevant non-PII input facts used at creation.

### 6. Qualification and sampling/allocation

`evaluateCommerceEvent(eventId)` loads an immutable event snapshot and active moment versions, evaluates them deterministically, records one `QualificationEvaluation` per event/version/engine version, and creates at most one assignment for each qualifying event/moment version.

The audit record contains structured reason codes, rule inputs without PII, outcome, engine version, and allocation decision. MVP allocation is deterministic: weekly merchant cap, configured moment weight/cap, priority, cooldown, and a stable hash tie-breaker. It is not anomaly detection. Database uniqueness is the final idempotency guard.

### 7. ResearchAssignment queue

Assignments are durable work items, not background-job rows. Status changes are guarded transitions with optimistic concurrency. Claiming uses an atomic conditional update (or `FOR UPDATE SKIP LOCKED`) so two researchers cannot claim the same item. The queue sorts by priority and event age, filters by eligibility/expiry, and exposes failure/attempt history.

Assignment lifecycle:

```text
queued -> claimed -> dialing -> reached -> completed
                    |          |-> declined
                    |-> no_answer -> queued (if retry allowed)
Any non-terminal eligible state -> expired/cancelled
```

Transition events are appended for audit and recovery; the assignment row holds the current projection.

### 8. Researcher operations UI

The `operations` UI is an internal, role-protected application, not a merchant analytics dashboard. It provides a live queue, atomic claim, assignment context, read-only published script, call control, notes, outcomes, transcript/tagging workflow, and a script-improvement suggestion. Server actions/API handlers invoke domain services and never write tables directly.

The queue shows event age, merchant/brand, first name only where authorized, order total, first/repeat status, products/SKUs, observed attribution, objective, priority, and call state. Phone remains masked. Polling is sufficient for MVP; real-time sockets are unnecessary.

### 9. Scripts and script versions

`Script` is a stable identity; immutable `ScriptVersion` rows contain a validated JSON document of sections, prompts, consent language, follow-ups, and referenced tag objectives. Only drafts can change. Publishing assigns a monotonically increasing version and checksum. Each assignment and interview pins the exact version. Researchers cannot edit published content during an interview.

### 10. Telephony lifecycle

Core research code depends on a `TelephonyProvider` port with operations such as `startCall`, `endCall`, and `getCall`, plus verified callback translation. Provider adapters own vendor IDs and payloads. A `Call` record preserves normalized state, provider reference, consent/recording flags, timestamps, error codes, and callback event deduplication.

The first implementation is a deterministic fake adapter. A real provider is added only after legal/consent and vendor decisions. Callbacks are signature verified and idempotent; provider-specific states map to normalized lifecycle events without leaking into `Interview` or `ResearchAssignment`.

### 11. Recording/transcription

Recording is optional and policy-gated. The database stores metadata and opaque object keys, not signed/public URLs. The `TranscriptionProvider` port accepts the minimum recording reference and returns normalized speaker segments. Provider callbacks/polling are translated into retry-safe jobs. A fake adapter supplies synthetic transcripts for development.

Recording, transcript, and derived evidence have distinct retention/deletion states. Transcription payloads contain no order or customer metadata beyond an opaque correlation token. Failed transcription never destroys the completed interview; manual transcript entry/import remains possible.

### 12. Tags and evidence

The interview form is composed from an immutable `ResearchFieldSetVersion`: platform defaults (including attribution questions), enabled merchant defaults, and Research Moment-specific fields. `InterviewResponse` pins the exact field version, typed value, provenance, and review state. Removing a field affects future published sets only.

Evidence is normalized through `ResponseEvidence`, linking a response to one or more transcript segments with exact character offsets and optional redacted excerpt snapshots. Human-reviewed values cannot be silently overwritten by AI suggestions. Self-reported discovery source, purchase trigger, and influence are separate default research fields; they do not mutate observed attribution.

`InterviewObservation` captures researcher-only context such as hesitation, excitement, reluctance, or confusion, with call offset and optional field/question association. It is explicitly labeled researcher-observed and does not pretend to be transcript evidence.

### 13. Angles

The `insights` module provides an internal editor. An `Angle` is a versioned finding for a merchant and reporting period, with category, cohort snapshot, question, claim, action, caveat, status, and explicit numerator/denominator where quantitative language is used.

`AngleEvidence` links angles to tag evidence/transcript spans and interviews. `AngleMetric` records metric type, population (`commerce` or `interview_sample`), numerator, denominator, unit, filters, and computation provenance. No free-form JSON evidence list is considered sufficient for a published angle.

### 14. Monthly report generation

`Report` is a merchant/month container with draft, rendering, published, failed, and superseded states. `ReportAngle` orders 3-5 executive angles and detailed sections while pinning angle revisions. Methodology and sample notes are mandatory. A render job produces print-friendly HTML first and optionally PDF, stores the artifact privately, and records template version/checksum and failure details. Published reports are immutable; corrections create a new revision.

### 15. Security, tenancy, authorization, retention, and deletion

- Every tenant-owned row includes `merchant_id`, including join/evidence tables where practical for defense in depth.
- Repository/service methods require an explicit tenant context. Composite foreign keys or database checks prevent cross-merchant references.
- Internal users authenticate through an OIDC-compatible managed identity provider with MFA; roles begin as `platform_admin`, `research_manager`, `researcher`, and `analyst`.
- Shopify merchant-admin identity is separate from internal workforce identity. Merchant setup access does not imply access to researcher operations across merchants.
- Authorization is enforced server-side at service boundaries and covered by cross-tenant tests.
- Secrets are runtime-only and validated at startup. Commit `.env.example` with names and safe placeholders; ignore all `.env*` except the example.
- Define retention policies by data class. Deletion uses an auditable request/tombstone plus idempotent jobs that remove PII and objects while retaining only legally permitted non-identifying audit facts.
- Shopify uninstall revokes use of tokens immediately and schedules merchant data handling according to contract and compliance requirements.
- Audit sensitive reads, role changes, exports, publishes, decrypts, and deletion actions without recording sensitive values.

Legal review of outbound contact, consent, recording, retention, and merchant/customer notices is a production launch gate, not an engineering inference.

### 16. Background jobs, retries, and failure recovery

Graphile Worker is the sole background job runner and `outbox_events` is the application-owned transactional handoff. A bounded dispatcher locks undispatched rows with `FOR UPDATE SKIP LOCKED`, validates the payload, invokes `graphile_worker.add_job`, and marks the row dispatched in one database transaction. A rollback therefore leaves neither a dispatched marker nor an orphan Graphile job. The old `durable_jobs` table is deprecated, retained only to preserve existing databases, and has no poller or runtime composition.

The event-to-task contract is intentionally explicit:

| Outbox event / task       | Opaque payload                   | Graphile job key                            | Maximum attempts |
| ------------------------- | -------------------------------- | ------------------------------------------- | ---------------: |
| `normalize_webhook`       | `merchantId`, `receiptId`        | `normalize_webhook:<receiptId>`             |               10 |
| `evaluate_commerce_event` | `merchantId`, `commerceEventId`  | `evaluate_commerce_event:<commerceEventId>` |               10 |
| `expire_assignments`      | `merchantId`, `assignmentId`     | `expire_assignments:<assignmentId>`         |                5 |
| `render_report`           | `merchantId`, `reportRevisionId` | `render_report:<reportRevisionId>`          |                5 |

Handlers validate strict UUID-only contracts and call injected, replay-safe service ports. Terminal validation failures are logged only as safe codes and complete without retry; operational failures throw a safe code for Graphile's bounded retry policy. The concrete normalization, qualification, expiry, and report-rendering service compositions remain an explicit later integration boundary and currently fail closed.

Operational replay clears `dispatched_at` only after the event has been inspected and any safe contract issue corrected. Republishing uses the same stable Graphile key, so replay replaces the existing logical job rather than duplicating it. Unsupported or sensitive payloads remain undispatched for investigation.

Every handler must define:

- a stable idempotency key and database uniqueness guard;
- maximum attempts and retry classification;
- correlation/causation IDs;
- safe structured errors without PII;
- a recovery/replay path;
- terminal failure visibility.

Initial job types are `normalize_webhook`, `evaluate_commerce_event`, `reconcile_shopify`, `expire_assignments`, `process_call_event`, `fetch_transcript`, `apply_retention`, `handle_privacy_request`, and `render_report`. Operational metrics track age, throughput, retries, terminal failures, webhook-to-assignment latency, and queue staleness. A periodic sweeper repairs orphaned or stuck states.

## End-to-end transaction and failure model

```text
Webhook transaction:
  WebhookReceipt + normalize job

Normalization transaction:
  commerce upserts + CommerceEvent + qualification job

Qualification transaction:
  QualificationEvaluation + ResearchAssignment + audit transition

Interview transaction(s):
  assignment transitions + Interview/Call + provider jobs

Evidence transaction:
  TranscriptSegments + reviewed InterviewTags + evidence links

Publishing transaction:
  Angle revision + evidence/metrics, then Report revision + render job
```

At-least-once delivery is assumed everywhere. Correctness comes from immutable inputs, idempotency keys, unique constraints, guarded state transitions, and replayable jobs—not from hoping a message runs once.

## Repository/module layout to establish in Milestone 0

```text
apps/
  web/                 # Official Shopify React Router app, HTTP handlers, and researcher/analyst UI
  worker/              # background-job entrypoint
packages/
  domain/              # shared IDs, enums, value objects, ports, rule schemas
  db/                  # schema, migrations, tenant-aware repositories
  shopify/             # Shopify adapter and payload normalization
  research/            # moments, qualification, assignments, scripts
  providers/           # telephony/transcription/object-store ports and fakes
  evidence/            # interviews, transcripts, tags, evidence
  reporting/           # angles, metrics, reports, render model
  testkit/             # synthetic factories and deterministic clock/IDs
docs/
```

Dependencies point inward: adapters/UI depend on domain services and ports; domain packages never import Shopify, telephony, transcription, React Router, or storage SDK types.

## Authentication and secrets conventions

- Shopify: official install/auth flow, encrypted offline token per merchant for webhook/reconciliation work, minimum scopes, and verified ID/session tokens for embedded setup.
- Internal workforce: managed OIDC with MFA and server-side role/merchant grants. Do not reuse Shopify sessions for researcher authentication.
- Environment variables: typed startup validation; only process entrypoints read `process.env`. Libraries receive configuration explicitly.
- Secret storage: local uncommitted `.env.local`; staging/production platform secret manager/KMS. No secret default values and no secrets exposed with `NEXT_PUBLIC_`.
- Key rotation: credential and PII rows carry key versions; rotation is a replayable maintenance job.

## Testing strategy

- **Unit:** rule evaluation, value objects, transition guards, metric calculations, redaction.
- **Database integration:** migrations, tenant boundaries, unique/idempotency constraints, transactional outbox, concurrent assignment claims.
- **Contract:** captured synthetic Shopify payload shapes and fake/real provider adapter contracts.
- **HTTP/security:** raw-body HMAC, callback signatures, authz, CSRF where relevant, privacy webhook behavior.
- **End-to-end:** deterministic synthetic order through report artifact, including duplicate delivery and retry injection.

Tests use synthetic identities and reserved fictional phone numbers only. The test kit rejects known-real-looking domains/numbers and log tests assert that synthetic PII markers do not appear in captured logs.

## Observability and auditability

Use opaque IDs, merchant ID, event type, state, duration, and correlation IDs in logs. Maintain append-only domain audit records for webhook receipt, qualification, assignment transitions, sensitive access, provider callbacks, angle publication, report publication, and deletion. Logs are operational signals, not an event store, and never contain interview text or customer PII.

## Decisions deferred but bounded

The following must be resolved in or before the named milestone without changing domain boundaries:

1. Hosting vendor and managed PostgreSQL/object store (Milestone 0).
2. Exact PostgreSQL job library after transaction/retry spike (Milestone 0).
3. Shopify distribution model and final minimum scopes/protected-data approval path (Milestone 1; before real dev-store PII).
4. Internal OIDC provider (before multi-user staging).
5. Telephony/transcription vendors and jurisdictional recording/consent policy (before real calls).
6. HTML-only versus HTML+PDF initial report artifact (Milestone 1 can ship HTML; PDF is later acceptance if reliable).

## Source references

- [Shopify: verify webhook deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- [Shopify: webhook behavior and reconciliation](https://shopify.dev/docs/apps/build/webhooks)
- [Shopify: protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [Shopify: privacy-law compliance webhooks](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [Shopify: app authentication](https://shopify.dev/docs/apps/build/authentication-authorization)
