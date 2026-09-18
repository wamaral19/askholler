# Holler Foundation Security, Privacy, and Reliability Review

## Review status and scope

This review applies to the greenfield foundation described in `docs/architecture.md`, `docs/data-model.md`, and `docs/mvp-plan.md`, including the clarified product requirements for:

- extensible, registry-backed cohort predicates;
- current product-category semantics rather than category snapshots on order line items;
- researcher-controlled manual dialing before a telephony integration exists;
- platform-default, merchant-default, and research-run-specific fields;
- human observations and future AI-suggested field values with distinct provenance.

The synthetic foundation now has application code, migrations, tenant-scoped repositories, durable job primitives, service-backed routes, and a development-only private-customer adapter. The automated persisted checks are environment-gated and were not executed during the 2026-09-17 update because no local PostgreSQL URL was available. This remains a development security review, not a production certification; the production integrations, authentication/composition, encryption/KMS adapter, browser behavior, and infrastructure must be reviewed before any real Shopify customer data or live call is used.

## Security invariants

The following are system invariants, not UI conventions:

1. Every merchant-owned read and write is evaluated in an explicit tenant context; a client-supplied `merchant_id` is never sufficient authorization.
2. Plaintext customer PII exists only inside narrowly defined server-side privacy operations and explicitly authorized, audited response paths.
3. Synthetic data is the only customer-like data allowed in development, tests, fixtures, prompts, screenshots, or source control.
4. Observed attribution and self-reported attribution remain separately typed, stored, queried, and labeled.
5. A human-reviewed research value is never silently replaced by an AI/imported value.
6. Every accepted derived research value and published Angle retains a provenance path to transcript evidence or a clearly labeled researcher observation.
7. Every externally delivered event and every retryable job is processed under at-least-once assumptions with a stable idempotency identity and a database uniqueness guard.
8. Product categories are resolved from the current merchant catalog by design. The evaluation audit records what category IDs and predicate versions were resolved when the decision ran, without treating those values as historical line-item category snapshots.
9. Qualification creates a research opportunity only. A call begins only after an authorized researcher explicitly acts.

## Foundation requirements

### 1. PII boundary and data classification

Define a small shared classification vocabulary in the domain package and apply it to DTO and logging reviews:

| Class                | Examples                                                                    | Allowed handling                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `secret`             | Shopify token, webhook secret, encryption key, provider signing secret      | Runtime secret store only; never browser-visible, logged, persisted unencrypted, or placed in job payloads                                 |
| `customer_pii`       | Name, phone, email, address, raw webhook body                               | Encrypted persistence only where approved; decrypt through `CustomerPrivateService`; never logged, traced, analyzed, or sent to AI tooling |
| `sensitive_research` | Transcript text, recordings, researcher notes/observations, field responses | Tenant- and role-protected; private storage; not operational logs or general analytics                                                     |
| `tenant_business`    | Orders, SKUs, category labels, observed attribution, research configuration | Tenant-protected; only minimum fields exposed to each role                                                                                 |
| `operational_safe`   | Opaque IDs, categorical state, duration, retry count, safe error code       | Allowed in structured logs and job payloads                                                                                                |

Foundation implementation requirements:

- `CustomerPrivate` is the only customer contact envelope. It contains encrypted given name and E.164 phone; email is omitted until a concrete approved use case requires it. Address is not an MVP field.
- Use authenticated envelope encryption in production with a per-record nonce/authentication tag and a stored key version. Keys and ciphertext must not share the same security boundary. Do not invent cryptography in application code.
- Ordinary commerce/research repositories must not return `CustomerPrivate` fields. Decryption is exposed through a purpose-specific service operation, not a generic `decryptCustomer` method.
- Transcript, recording, free-form note, observation, and field-response content are sensitive even when they contain no formal contact field. They must not be passed to logs, error monitoring, product analytics, session replay, or coding/LLM prompts.
- Raw webhook/provider bodies are verified and parsed in memory, then discarded. Store a cryptographic digest plus allowlisted normalized values. Any future quarantine mechanism requires separate approval, encryption, access audit, and automatic expiry.
- Recording and report artifacts use opaque private object keys. Signed URLs are generated on demand with short expiry and are never stored in rows, logs, audit metadata, or client analytics.
- All error objects cross a sanitizer before logging or monitoring. Framework request-body capture, ORM parameter logging, session replay, and server-action payload capture are disabled by default.
- Audit events record actor, action, resource ID, tenant, result, correlation ID, and safe reason code. They never record decrypted values, transcript excerpts, request bodies, or field values.

### 2. Tenancy and authorization

- Every tenant aggregate and security-relevant join includes `merchant_id`. Composite foreign keys such as `(merchant_id, parent_id)` must prevent cross-merchant references even when UUIDs are globally unique.
- Every repository/service method accepts a server-derived `TenantContext` containing actor identity, role/grants, and merchant scope. Do not expose unscoped `findById(id)` methods for tenant data.
- Browser routes derive tenant access from authenticated membership. Route parameters, form fields, webhook headers, and job payloads cannot grant tenant access.
- Internal roles start least-privileged: `researcher` can access claimed/eligible operational work for granted merchants; `research_manager` can manage runs and review research; `analyst` can build reports; `platform_admin` is exceptional and fully audited.
- Shopify embedded/admin identity is not workforce identity. A Shopify session must not grant access to cross-merchant researcher operations.
- Exports, report artifacts, transcript/recording access, PII reveal, role changes, configuration publication, and deletion are explicit authorization actions and are audited.
- Add PostgreSQL row-level security only as defense in depth after connection pooling/job execution semantics are designed. It does not replace scoped repositories and composite constraints.

### 3. Secrets and environment separation

- Ignore `.env`, `.env.*`, local certificates, dumps, and provider credential files; allow only `.env.example` with names and nonfunctional placeholders.
- Only process entrypoints read `process.env`. Validate configuration at startup, reject missing production secrets, and pass typed configuration into libraries.
- Never use fallback/default production secrets. Reject secrets that equal example placeholders. No secret may use a `NEXT_PUBLIC_` prefix or enter a client bundle.
- Separate development, test, staging, and production databases, buckets, Shopify apps, provider accounts, signing secrets, and encryption keys. Production data must not be copied to a lower environment.
- Store Shopify offline tokens and future provider credentials in dedicated encrypted credential storage, unavailable to ordinary tenant/domain queries. Support `revoked_at` and key versioning from the first migration that introduces credentials.
- CI performs secret scanning over commits and generated build artifacts. Dependency lockfiles are committed; security updates and provenance review are required before production deployment.

### 4. Shopify webhook and normalized-event idempotency

The trusted ingress order must be fixed:

1. Read the exact raw bytes under a bounded body-size and request timeout.
2. Verify Shopify HMAC with a constant-time comparison before parsing/trusting topic, shop, API version, delivery ID, or body.
3. Resolve the merchant using the verified shop identity.
4. In one transaction, insert the immutable receipt and enqueue/write the normalization outbox item.
5. Return promptly; normalization never blocks the webhook response.

Required database guards:

- unique `(provider, delivery_id)` for webhook receipts;
- unique `(merchant_id, source, source_event_id)` for CommerceEvents;
- unique `(commerce_event_id, research_moment_version_id, engine_version)` for qualification evaluations;
- unique `(commerce_event_id, research_moment_version_id)` for assignments;
- unique callback event identities for telephony/transcription providers;
- unique outbox/job idempotency keys.

Duplicate delivery must return a successful acknowledgement after the existing durable receipt is established, not re-run side effects inline. A repeated delivery ID with a different body digest is a high-severity integrity signal and must not overwrite the original. Invalid HMAC creates no trusted receipt, merchant association, domain event, or job. If rejected-attempt metrics are needed, record only safe counters/categorical data.

Source ordering is not trusted. Reconciliation and webhook paths use the same deterministic normalization service and compare source update versions/timestamps without deleting newer state. Mandatory Shopify privacy/deletion webhooks and uninstall behavior are live-launch requirements.

### 5. Background jobs, retries, and recovery

- A domain state change and its outbox event commit in the same database transaction. No correctness-critical `afterCommit` network call or in-memory enqueue is permitted.
- Job payloads contain opaque IDs, schema version, correlation/causation IDs, and safe options only—never phones, emails, names, webhook bodies, transcript text, access tokens, signed URLs, or recording URLs.
- Each handler documents an idempotency key, uniqueness guard, retryable vs terminal failures, maximum attempts, timeout/lease, exponential backoff with jitter, and an operator replay path.
- State transitions use conditional writes/optimistic versions. Retries cannot regress terminal state, create a second call, overwrite reviewed evidence, or publish duplicate report revisions.
- Dead-letter records contain safe error codes and opaque references. Replay is authorized/audited and invokes the same idempotent handler rather than a bypass path.
- Workers reauthorize tenant/resource relationships when loading by job ID. Possession of an opaque ID in a queue is not authorization.
- Add a sweeper for stranded outbox rows, expired job leases, stale assignment claims, pending callbacks, and incomplete deletion steps. Recovery actions are idempotent and observable.

### 6. Researcher phone reveal and call initiation

Manual dialing changes the earlier masked-only assumption. The queue and assignment list remain masked; an authorized researcher can reveal/copy the number only through a deliberate server-side action.

Required behavior:

- Only the researcher who currently holds an unexpired atomic claim (and an authorized manager override) can request a reveal.
- The reveal endpoint accepts assignment/customer opaque IDs, verifies tenant membership, assignment state, claim ownership, contactability/suppression state, and reveal purpose, then decrypts only the phone number.
- A reveal is explicit (`Reveal phone`), time-limited in the UI, and not prefetched, embedded in page HTML, included in React/server caches, placed in URLs, copied into browser storage, or returned by queue/list APIs.
- Set `Cache-Control: no-store`; disable analytics/session replay on the reveal component/page. The client clears the value on timeout, navigation, completion, claim loss, and sign-out. Client clearing is exposure reduction, not an erasure guarantee.
- Audit every success and denial with actor, assignment/customer opaque IDs, merchant, timestamp, purpose, and result—but never the phone value. Rate-limit and alert on unusual reveal volume.
- `Start interview` creates one idempotent interview/call-attempt record but does not automatically dial in the manual MVP. Revealing/copying the number is a distinct recorded action.
- Do not store a plaintext phone in notes, interview rows, call rows, audit events, clipboard telemetry, or provider metadata.
- When a telephony adapter is introduced, pass the customer ID server-side and resolve the phone inside the privacy boundary; remove routine raw reveal if the provider workflow makes it unnecessary.

Legal approval for outbound contact, suppression handling, caller identification, time-of-day rules, and recording consent remains a production launch gate even if the software can reveal a number.

### 7. Current-category cohort semantics

The requested product rule is that a product's current category classification applies to historical orders. Therefore `OrderLineItem` keeps product/variant IDs but does not snapshot category membership for cohort evaluation.

Security and integrity requirements:

- `Product`, `Category`, and `ProductCategoryAssignment` are tenant-scoped. Category keys are unique within merchant and namespace; cross-tenant product/category assignment is blocked by composite foreign keys.
- Category changes require a privileged configuration/catalog-sync path and an audit event. Free-form SQL from a merchant or browser is prohibited.
- Cohort predicates are code-registered modules with a versioned runtime config schema, parameterized query compilation/evaluation, a human-readable description, and mandatory tenant-scope injection. Configuration never contains executable JavaScript or raw SQL.
- Complex internal predicates may use reviewed SQL/query-builder code, but the registry owns the query. User-provided values remain bind parameters and cannot choose arbitrary tables, joins, columns, operators, or tenant IDs.
- Qualification uses current category assignments at evaluation time. `QualificationEvaluation.input_snapshot` records non-PII resolved facts sufficient to explain the decision: predicate key/version, product IDs, category IDs/keys, resolution timestamp/catalog revision if available, outcome, and reason codes.
- The audit snapshot explains a prior decision; it does not change historical line items into category snapshots and is not silently re-evaluated after recategorization.
- Cohort preview and live evaluation call the same predicate implementation. Preview queries have bounded cost/time, tenant scope, pagination/count limits, and no customer PII result set.
- Re-evaluation after a category change must be an explicit, versioned operation with a defined assignment policy. Existing completed/active assignments are not silently rewritten or duplicated.

### 8. Research fields, observations, and AI/manual provenance

Treat “tags” as versioned research-field definitions and responses, with researcher observations as a separate evidence type. The effective field set for a published Research Moment version is resolved from platform defaults, enabled merchant defaults, and run-specific additions/removals, then pinned immutably to the assignment/interview.

Foundation requirements:

- `ResearchField` has a stable semantic identity. `ResearchFieldVersion` is immutable after publication and defines value type, allowed options, instructions, attribution semantic, whether evidence is required, and permitted completion sources.
- `ResearchFieldSetVersion` and ordered items record the exact effective fields for the run. Publishing, not interview start time, resolves inheritance so historical calls are reproducible.
- `InterviewResponse` records the exact field version and field-set version, typed value, source (`researcher`, `ai_suggested`, `imported`), creator/model/import identity, creation time, review status, reviewer, and supersession link. Do not update accepted values in place.
- `InterviewObservation` records researcher-only contextual evidence such as hesitation, reluctance, excitement, or nonverbal context, with author, controlled observation type, optional sensitive note, interview offset/current prompt, and creation time. It must never be presented as a customer quote or transcript-derived fact.
- Transcript-derived accepted responses require one or more segment/span evidence links. Observation-derived responses/Angles require an observation evidence link and are labeled `researcher_observed`. A response cannot claim both evidence types ambiguously.
- AI output is always stored initially as `ai_suggested`, including model/provider, prompt-template version, inference timestamp, and source evidence IDs. Prompt/response bodies are not operational logs. Real transcript content may not be sent to an AI provider until a separate vendor, data-processing, retention, and regional-use review is approved.
- AI cannot overwrite, mutate, supersede, or auto-accept a researcher-reviewed response. Acceptance is a distinct human-authorized transition; conflicts remain visible.
- Observed attribution is an order/event value. Self-reported discovery, trigger, and influence are separate research-field semantics. Type/API names must make the distinction explicit; no generic merged `attribution` property is allowed.
- Field values, notes, observations, and transcript excerpts never appear in qualification/job/audit logs. Reports may contain intentionally selected, reviewed, and appropriately redacted evidence only.

## Launch blockers and deferred work

### Blockers for merging the Foundation PR

These must exist before parallel feature agents build on the foundation:

1. Tenant/actor context and scoped repository conventions, plus composite tenant constraints in the initial schema.
2. Typed configuration that fails closed, `.env*` ignore rules, a safe `.env.example`, and CI secret scanning.
3. PII/sensitive-data classification, logger redaction/allowlisting, and purpose-specific `CustomerPrivateService` and private-object-store ports.
4. Idempotency identities and uniqueness constraints for receipt -> event -> evaluation -> assignment -> outbox/job.
5. Versioned cohort predicate contract that enforces tenant scoping and rejects raw SQL/executable config.
6. Versioned research-field/field-set contracts with explicit human/AI/import provenance, review states, supersession, and evidence-reference types.
7. Explicit current-category semantics in shared contracts and tests: live catalog lookup plus evaluation audit facts, no line-item category snapshot.
8. Deterministic synthetic factories and a guard rejecting non-approved fixture phone/email ranges and sensitive log output.

The Foundation PR does not need a working phone reveal UI, real encryption/KMS adapter, live webhook endpoint, production identity provider, or AI provider. It must define interfaces and prevent downstream code from bypassing the boundaries.

### Blockers before any real Shopify protected customer data

- Official Shopify auth/session handling, minimum approved scopes, encrypted offline-token storage, verified raw-body HMAC, bounded webhook requests, mandatory privacy webhooks, uninstall handling, and deletion workflows.
- Managed runtime secrets/KMS, environment isolation, encrypted backups/storage, error-monitoring scrubbing, access audit, production auth with MFA, tenant grants, and cross-tenant test coverage for every repository/service.
- Retention policies and demonstrable database/object/provider deletion; backup/restore and key-rotation procedures.
- Shopify protected-customer-data approval and privacy/legal documentation appropriate to the app's actual data use.

### Blockers before any live outbound call or recording

- Legal/product approval for contact basis, TCPA/state and time-zone/time-of-day behavior, suppression/opt-out, brand representation, recording consent by jurisdiction, and retention.
- Claim-gated phone reveal controls above, or a server-side provider dialer that avoids reveal; production monitoring for reveal abuse.
- Verified telephony/transcription callbacks, payload minimization, provider security/data-processing review, recording policy enforcement, and provider deletion tests.

### Safe to defer until after the synthetic vertical slice

- Row-level security, provided scoped repositories/composite constraints and tests exist.
- Automated anomaly detection or adaptive allocation.
- Real telephony/transcription and AI tagging providers.
- Automated key rotation (rows must still carry key versions and a documented manual rotation path).
- Fine-grained attribute-based access beyond the initial roles.
- Automated evidence redaction/classification; manual reviewed redaction is acceptable initially.
- A merchant-authored cohort GUI for every predicate. Registry/config validation and internal configuration can precede GUI support.
- Additional category taxonomies/namespaces beyond the first merchant-controlled/current Shopify mapping.

## Automated-test checklist

All tests use deterministic synthetic identities and reserved fictional contact data. Capture logs/traces during security tests and fail if fixture markers or forbidden keys appear.

### Secrets and PII

- [ ] `.env`, `.env.local`, key/certificate files, dumps, and credentials are ignored; only safe placeholders are tracked.
- [ ] Production startup fails on missing/example secrets and refuses `NEXT_PUBLIC_` secret configuration.
- [ ] Build-output scan finds no server secret or encrypted-token plaintext in client bundles/source maps.
- [ ] Logger property/fuzz tests redact or reject phone, email, name, authorization headers, cookies, tokens, raw bodies, transcript text, notes, observations, signed URLs, and field values.
- [ ] Errors from parsing, ORM, providers, and jobs expose a safe code/correlation ID without input payloads or SQL parameter values.
- [ ] Synthetic-fixture guard accepts reserved fictional contacts and rejects known-real-looking/non-approved phone/email fixtures.
- [ ] PII encryption round-trip, wrong-key/version, modified ciphertext/auth-tag, and key-version routing tests fail safely.

### Tenancy and authorization

- [ ] For every tenant-scoped repository/service, merchant A cannot read, update, delete, link, export, reveal, or publish merchant B resources even when given valid B IDs.
- [ ] Composite FKs reject cross-merchant relationships for customer/order/event/moment/assignment/interview/evidence/category/angle/report joins.
- [ ] Role matrix tests cover queue access, claim, reveal, run publication, transcript/recording access, evidence review, export, report publication, role changes, and deletion.
- [ ] Tenant route parameters and tampered form/server-action payloads do not override authenticated merchant grants.
- [ ] Shopify merchant sessions cannot access workforce operations; revoked/disabled memberships lose access immediately.

### Webhooks, callbacks, and normalization

- [ ] Valid HMAC over exact raw bytes succeeds; invalid, missing, malformed, wrong-secret, parsed/re-serialized, oversized, and timed-out requests fail before trusted persistence.
- [ ] An invalid request cannot create a merchant association, CommerceEvent, or job.
- [ ] Same delivery ID/body produces one receipt, normalization effect, CommerceEvent, qualification evaluation, assignment, and success acknowledgement.
- [ ] Same delivery ID/different digest is quarantined/alerted without overwriting or duplicating effects.
- [ ] Reconciliation plus webhook overlap and out-of-order source updates converge without regressing newer data.
- [ ] Provider callbacks reject invalid signatures and deduplicate valid repeated external event IDs.
- [ ] Privacy/uninstall webhooks are idempotent and drive auditable deletion/revocation steps.

### Jobs and concurrency

- [ ] Rollback of a domain transaction leaves neither committed state nor an orphan outbox item; commit produces both.
- [ ] Crash after side effect/before acknowledgement can replay without duplicate event, assignment, interview/call, response, Angle, report, object, or deletion effect.
- [ ] Two workers claiming the same job/assignment yield one winner; lease expiry and replay do not regress terminal state.
- [ ] Retryable and terminal errors follow configured attempts/backoff and create safe dead-letter data.
- [ ] Replaying a dead-letter job uses normal authorization/idempotency paths and is audited.
- [ ] Sweeper recovers synthetic stuck outbox, expired lease, stale claim, pending callback, and partial deletion cases.
- [ ] Job/outbox payload serialization rejects PII, transcript/notes/response content, access tokens, signed URLs, and raw provider bodies.

### Phone reveal and call initiation

- [ ] Queue/list/assignment preload payloads contain masked phone only and no encrypted/plaintext phone field.
- [ ] Unauthenticated, ungranted-tenant, unclaimed, expired-claim, wrong-researcher, terminal-assignment, suppressed, and deleted-customer reveals are denied and audited safely.
- [ ] Authorized reveal returns only the phone with `no-store`; the page has no analytics/session replay and does not cache/persist it in URL or browser storage.
- [ ] Success and denial audits identify actor/resource/result but never contain the phone.
- [ ] Rate limiting and abnormal-volume alert tests work without logging revealed values.
- [ ] Repeated `Start interview` requests create one attempt/call identity; manual mode never invokes a real provider.
- [ ] Sign-out, claim loss, completion, and navigation clear the displayed value and prevent further reveal.

### Cohort predicates and current categories

- [ ] Predicate config validation rejects unknown keys/versions, executable content, raw SQL, invalid operators/types, and attempts to supply tenant/table/column names.
- [ ] Every predicate query receives server-side tenant scope; malicious category/product IDs from another merchant return no data and cannot affect SQL structure.
- [ ] The first-order-excludes/current-order-includes-category scenario qualifies only the intended second-order customer.
- [ ] Recategorizing a product changes a subsequent preview/evaluation according to the current-category rule, without mutating historical line items.
- [ ] The original QualificationEvaluation retains resolved product/category IDs, predicate version, resolution time/catalog revision, and reason codes after recategorization.
- [ ] Preview and live evaluation produce the same decision for the same catalog revision and inputs.
- [ ] Concurrent recategorization/evaluation follows a documented transaction/isolation rule and produces a self-consistent audit snapshot.
- [ ] Re-evaluation is explicit and does not silently duplicate or rewrite active/completed assignments.
- [ ] Preview query limits/timeouts prevent an unbounded predicate from exhausting the database.

### Research fields, AI/manual provenance, and evidence

- [ ] Publishing a run resolves platform + merchant + run-specific additions/removals into one immutable ordered field-set version.
- [ ] Existing assignments/interviews retain their field-set/field versions after defaults or run definitions change.
- [ ] Typed values reject invalid option IDs, shapes, and cross-version values.
- [ ] AI/imported responses begin as suggested; only authorized human review can accept them.
- [ ] AI suggestions cannot update, delete, auto-accept, or silently supersede accepted researcher responses; conflicts remain queryable.
- [ ] Corrections create superseding records with actor/time/reason and leave the prior record auditable.
- [ ] Transcript-derived accepted responses require valid same-tenant segment/span evidence; offsets are range checked.
- [ ] Researcher observations record author/type/time/prompt and are displayed/reported as observed context, never transcript quotation.
- [ ] Angles cannot publish without same-tenant accepted evidence; deletion/redaction cannot leave a published Angle silently supported by a broken link.
- [ ] Observed attribution DTOs cannot accept self-reported fields and vice versa; comparison views/exports label source and missing/unknown states explicitly.
- [ ] AI-provider calls are disabled for real transcript data unless an approved provider policy/configuration gate is enabled; prompts/results are excluded from operational logs.

### Retention and deletion

- [ ] Customer and shop deletion are idempotent across PII ciphertext/blind indexes, recordings, transcripts, evidence, exports/reports where required, object storage, credentials, and external providers.
- [ ] Deletion steps can retry independently, preserve only permitted non-identifying audit facts, and demonstrate completion.
- [ ] Retention expiry denies new reveal/artifact access immediately and eventually removes underlying data.
- [ ] Legal hold behavior is authorized/audited and cannot be set by researchers or merchant-controlled request data.
- [ ] Backups, restored environments, and generated artifacts follow documented retention and environment-separation rules.

## Required follow-up review points

Agent 7 should repeat code-level review at these integration points:

1. After Foundation schema/config/logger/testkit land.
2. When Shopify OAuth/webhooks and normalization are implemented.
3. Before the phone reveal/manual call UI is enabled for any non-synthetic account.
4. When the first real telephony, transcription, or AI provider is selected.
5. Before staging receives protected customer data and before production pilot launch.

Each review must inspect actual migrations, SQL/repository scoping, route handlers, middleware, logs/error-monitoring configuration, browser network payloads, object-store policy, worker retry behavior, and provider callback verification. Documentation alone does not close a launch blocker.
