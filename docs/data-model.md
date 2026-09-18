# Holler MVP Data Model

## Modeling principles

This is a first-pass PostgreSQL relational schema for a greenfield implementation. Names are logical; migrations may use `snake_case`. All primary keys are UUIDv7 (or another sortable application-generated UUID), all timestamps are `timestamptz` in UTC, and all mutable tables include `created_at` and `updated_at` unless explicitly append-only.

Core rules:

- Tenant ownership is explicit. Every merchant-owned aggregate has `merchant_id`; external IDs are unique only within that merchant/source.
- PII is isolated and encrypted. Ordinary domain joins do not expose names, phones, email, or addresses.
- Provider payloads and types stop at adapters. Domain rows use normalized states plus opaque provider references.
- Money is `bigint` minor units plus ISO-4217 currency, never floating point.
- Published scripts, moment definitions, tag definitions, angles, and reports are immutable revisions.
- Observed attribution is an order/event fact. Self-reported attribution is a reviewed, evidence-backed interview fact. They are never stored in one field.
- Derived findings use normalized evidence links. JSON can capture versioned rule/cohort snapshots but cannot replace provenance constraints.
- Deletion is modeled explicitly so asynchronous erasure is auditable and retryable.

## Common conventions

Suggested PostgreSQL enum/check domains are documented below, but application-level string unions mirror them. Use check constraints for state/value validation and database uniqueness as the last line of idempotency defense. JSON columns carry a `schema_version` and are parsed through shared runtime schemas before use.

For strict cross-tenant integrity, important child references use composite candidates such as `(merchant_id, id)` even where `id` is globally unique. Services always require a `TenantContext`; database roles/RLS can be added as defense in depth after repository tests prove access patterns.

## Identity, tenancy, and access

### Merchant

| Column                            | Type                 | Notes                                                    |
| --------------------------------- | -------------------- | -------------------------------------------------------- |
| `id`                              | uuid PK              | Internal tenant ID                                       |
| `shopify_shop_id`                 | text nullable        | Stable Shopify shop ID; unique when present              |
| `shop_domain`                     | citext nullable      | Canonical `*.myshopify.com`; unique when present         |
| `name`                            | text                 | Display name, not customer PII                           |
| `timezone`                        | text                 | IANA name used for weekly/monthly boundaries             |
| `weekly_interview_target`         | integer              | `>= 0`                                                   |
| `status`                          | text                 | `pending`, `active`, `paused`, `uninstalled`, `deleting` |
| `default_retention_policy_id`     | uuid nullable FK     | Current merchant policy                                  |
| `installed_at` / `uninstalled_at` | timestamptz nullable | Lifecycle                                                |

### ShopifyCredential

Separate from `Merchant` so access tokens cannot leak through normal tenant reads.

| Column                    | Type                 | Notes                                       |
| ------------------------- | -------------------- | ------------------------------------------- |
| `merchant_id`             | uuid PK/FK           | One active credential envelope per merchant |
| `encrypted_offline_token` | bytea                | Envelope-encrypted                          |
| `key_version`             | text                 | KMS key/version reference                   |
| `scopes`                  | text[]               | Granted scopes                              |
| `token_expires_at`        | timestamptz nullable | If expiring token model applies             |
| `revoked_at`              | timestamptz nullable | Immediate use stop                          |

### User, MerchantMembership

`User(id, oidc_subject, display_name, status, last_login_at)` contains workforce identity; `MerchantMembership(user_id, merchant_id, role)` grants tenant access. Platform-wide roles live in a separate `UserRole` table. Do not place auth-provider tokens in these rows.

## Commerce and ingress

### Customer

Non-PII commerce profile.

| Column                               | Type                 | Notes                                                        |
| ------------------------------------ | -------------------- | ------------------------------------------------------------ |
| `id`                                 | uuid PK              | Internal ID                                                  |
| `merchant_id`                        | uuid FK              | Tenant                                                       |
| `shopify_customer_id`                | text nullable        | Unique with merchant when present; guest orders may lack it  |
| `source_created_at`                  | timestamptz nullable | Shopify creation time                                        |
| `order_count`                        | integer              | Current source projection                                    |
| `lifetime_revenue_minor`             | bigint               | Current source projection                                    |
| `currency`                           | char(3) nullable     | Null if totals span currencies                               |
| `first_order_at` / `latest_order_at` | timestamptz nullable | Commerce context                                             |
| `contactability_status`              | text                 | `unknown`, `eligible`, `ineligible`, `suppressed`, `deleted` |
| `deleted_at`                         | timestamptz nullable | Non-PII tombstone state                                      |

Constraints: unique `(merchant_id, shopify_customer_id)` where ID is non-null; unique `(merchant_id, id)` for composite references.

### CustomerPrivate

One-to-one protected data envelope owned by the privacy module.

| Column                 | Type                 | Notes                                                |
| ---------------------- | -------------------- | ---------------------------------------------------- |
| `customer_id`          | uuid PK/FK           | Customer                                             |
| `merchant_id`          | uuid                 | Duplicated for tenant guard                          |
| `encrypted_given_name` | bytea nullable       | Minimum name needed for calls                        |
| `encrypted_phone_e164` | bytea nullable       | Minimum contact channel                              |
| `encrypted_email`      | bytea nullable       | Store only for an approved use case                  |
| `phone_blind_index`    | bytea nullable       | Keyed hash only if equality/dedup lookup is required |
| `key_version`          | text                 | Encryption key version                               |
| `source_updated_at`    | timestamptz nullable | Freshness                                            |
| `expires_at`           | timestamptz nullable | Retention deadline                                   |
| `deleted_at`           | timestamptz nullable | Erasure completion                                   |

No address fields are proposed for MVP. Geographic qualification should use a coarse, separately allowlisted non-identifying region only if legally/product justified.

### Order

| Column                         | Type                 | Notes                                       |
| ------------------------------ | -------------------- | ------------------------------------------- |
| `id`                           | uuid PK              | Internal ID                                 |
| `merchant_id`                  | uuid FK              | Tenant                                      |
| `customer_id`                  | uuid nullable FK     | Guest/deleted customer safe                 |
| `shopify_order_id`             | text                 | Unique with merchant                        |
| `source_order_number`          | text nullable        | Operational display, not identity           |
| `ordered_at`                   | timestamptz          | Source occurrence time                      |
| `source_updated_at`            | timestamptz          | Ordering/reconciliation                     |
| `total_minor`                  | bigint               | `>= 0`                                      |
| `currency`                     | char(3)              | ISO-4217                                    |
| `customer_order_sequence`      | integer nullable     | `1` means first order; avoids stale boolean |
| `financial_status`             | text nullable        | Normalized/allowlisted                      |
| `fulfillment_status`           | text nullable        | Normalized/allowlisted                      |
| `cancelled_at` / `refunded_at` | timestamptz nullable | Eligibility context                         |
| `observed_attribution`         | jsonb                | Validated `ObservedAttributionV1` snapshot  |

`ObservedAttributionV1` contains normalized source/channel/campaign/referrer/landing/UTM fields, provider/source, observed timestamp, and an allowlisted raw fragment. It must never include interview answers.

### OrderLineItem

| Column                                      | Type          | Notes                              |
| ------------------------------------------- | ------------- | ---------------------------------- |
| `id`                                        | uuid PK       | Stable internal row                |
| `merchant_id`                               | uuid FK       | Tenant guard                       |
| `order_id`                                  | uuid FK       | Parent                             |
| `shopify_line_item_id`                      | text          | Unique with merchant/order         |
| `shopify_product_id` / `shopify_variant_id` | text nullable | Source identities                  |
| `sku`                                       | text nullable | Point-in-time snapshot             |
| `title` / `variant_title`                   | text nullable | Product snapshot, no customer data |
| `quantity`                                  | integer       | `> 0`                              |
| `unit_price_minor`                          | bigint        | `>= 0`                             |
| `currency`                                  | char(3)       | Currency                           |

### Product and current Category

`Product(id, merchant_id, shopify_product_id, title, catalog_enrichment_state, source_updated_at)` is the current catalog projection. `ProductCategory(id, merchant_id, source, key, label)` supports Shopify taxonomy, Shopify product type, and merchant-defined namespaces. `ProductCategoryAssignment(product_id, category_id)` is the current many-to-many classification.

Categories are intentionally not snapshotted onto order line items. Historical-order cohort predicates join each line item's product to its current category assignments, so merchant recategorization changes subsequent evaluation. A completed `QualificationEvaluation` still preserves its predicate versions, outcome, reason codes, and non-PII facts used at that time.

### WebhookReceipt

Immutable ingress audit and deduplication record.

| Column                         | Type          | Notes                                                  |
| ------------------------------ | ------------- | ------------------------------------------------------ |
| `id`                           | uuid PK       | Internal receipt                                       |
| `merchant_id`                  | uuid nullable | Set after verified resolution                          |
| `provider`                     | text          | `shopify`                                              |
| `delivery_id`                  | text          | Unique `(provider, delivery_id)`                       |
| `topic`                        | text          | Trusted only after HMAC verification                   |
| `api_version`                  | text nullable | Source contract                                        |
| `triggered_at` / `received_at` | timestamptz   | Source vs local                                        |
| `body_sha256`                  | bytea         | Audit/dedup without retaining body                     |
| `verification_status`          | text          | `verified`, `rejected`                                 |
| `processing_status`            | text          | `received`, `queued`, `processed`, `failed`, `ignored` |
| `error_code`                   | text nullable | Safe categorical code                                  |

Rejected deliveries may be metered without storing payload or untrusted identifying headers.

### CommerceEvent

Immutable provider-neutral event used by qualification.

| Column                 | Type             | Notes                                                   |
| ---------------------- | ---------------- | ------------------------------------------------------- |
| `id`                   | uuid PK          | Internal event                                          |
| `merchant_id`          | uuid FK          | Tenant                                                  |
| `customer_id`          | uuid nullable FK | Subject                                                 |
| `order_id`             | uuid nullable FK | Context                                                 |
| `event_type`           | text             | Initially `order_completed`; later fulfillment/delivery |
| `source`               | text             | `shopify_webhook`, `shopify_reconcile`, `synthetic`     |
| `source_event_id`      | text             | Stable idempotency identity                             |
| `occurred_at`          | timestamptz      | Source time                                             |
| `ingested_at`          | timestamptz      | Local time                                              |
| `schema_version`       | integer          | Normalized payload contract                             |
| `attributes`           | jsonb            | Validated non-PII event snapshot                        |
| `observed_attribution` | jsonb nullable   | Point-in-time attribution snapshot                      |
| `correlation_id`       | uuid             | Trace across jobs                                       |

Unique `(merchant_id, source, source_event_id)`. Do not use a mutable `processing_status` here; processing attempts belong to jobs/evaluations, preserving the event as a fact.

## Research definition and qualification

### Script

| Column                 | Type          | Notes                        |
| ---------------------- | ------------- | ---------------------------- |
| `id`                   | uuid PK       | Stable script identity       |
| `merchant_id`          | uuid nullable | Null means platform template |
| `name` / `description` | text          | Metadata                     |
| `status`               | text          | `active`, `archived`         |

### ScriptVersion

| Column                          | Type          | Notes                                         |
| ------------------------------- | ------------- | --------------------------------------------- |
| `id`                            | uuid PK       | Immutable revision                            |
| `script_id`                     | uuid FK       | Parent                                        |
| `merchant_id`                   | uuid nullable | Denormalized tenant guard                     |
| `version`                       | integer       | Unique `(script_id, version)`                 |
| `status`                        | text          | `draft`, `published`, `retired`               |
| `content`                       | jsonb         | Validated sections/prompts/consent/follow-ups |
| `content_schema_version`        | integer       | Parser version                                |
| `checksum`                      | bytea         | Reproducibility                               |
| `published_at` / `published_by` | nullable      | Audit                                         |

Only drafts are mutable; publication makes the content immutable.

### ResearchMoment

Stable identity and human-facing metadata.

| Column        | Type    | Notes                                   |
| ------------- | ------- | --------------------------------------- |
| `id`          | uuid PK | Aggregate identity                      |
| `merchant_id` | uuid FK | Tenant                                  |
| `name`        | text    | Display name                            |
| `status`      | text    | `draft`, `active`, `paused`, `archived` |

### ResearchMomentVersion

| Column                               | Type                 | Notes                              |
| ------------------------------------ | -------------------- | ---------------------------------- |
| `id`                                 | uuid PK              | Immutable published revision       |
| `research_moment_id` / `merchant_id` | uuid FK              | Parent/tenant                      |
| `version`                            | integer              | Unique per moment                  |
| `event_type`                         | text                 | Matches `CommerceEvent.event_type` |
| `objective`                          | text                 | Researcher-visible purpose         |
| `cohort_expression`                  | jsonb                | Versioned predicate expression AST |
| `priority`                           | integer              | Bounded priority                   |
| `allocation_policy`                  | jsonb                | Weight/cap/cooldown schema         |
| `script_version_id`                  | uuid FK              | Must be published                  |
| `research_field_set_version_id`      | uuid FK              | Exact interview field set          |
| `active_from` / `active_to`          | timestamptz nullable | Effective interval                 |
| `published_at` / `published_by`      | nullable             | Audit                              |

### ResearchField and ResearchFieldVersion

`ResearchField` is the stable platform- or merchant-scoped identity. Immutable `ResearchFieldVersion` rows define prompt, value type, options/scale, required and evidence expectations, attribution semantic, and allowed completion modes. Default attribution fields can coexist with run-specific questions such as moisturizer consistency without affecting unrelated research runs.

### ResearchFieldSet and ResearchFieldSetVersion

The effective interview form is published as an immutable set version. `ResearchFieldSetItem(field_set_version_id, field_version_id, source, required, display_order)` records whether each item came from a platform default, merchant default, or research run. `ResearchAssignment` and `Interview` both pin the exact set version.

### QualificationEvaluation

| Column                       | Type        | Notes                                                      |
| ---------------------------- | ----------- | ---------------------------------------------------------- |
| `id`                         | uuid PK     | Evaluation                                                 |
| `merchant_id`                | uuid FK     | Tenant                                                     |
| `commerce_event_id`          | uuid FK     | Input                                                      |
| `research_moment_version_id` | uuid FK     | Rules used                                                 |
| `engine_version`             | text        | Reproducibility                                            |
| `outcome`                    | text        | `qualified`, `ineligible`, `capped`, `suppressed`, `error` |
| `reason_codes`               | text[]      | Stable, non-PII reasons                                    |
| `input_snapshot`             | jsonb       | Only rule-relevant non-PII values                          |
| `evaluated_at`               | timestamptz | Audit                                                      |

Unique `(commerce_event_id, research_moment_version_id, engine_version)` prevents duplicate evaluation effects while allowing an explicit future re-evaluation version.

### ResearchAssignment

| Column                                           | Type                 | Notes                  |
| ------------------------------------------------ | -------------------- | ---------------------- |
| `id`                                             | uuid PK              | Work item              |
| `merchant_id`                                    | uuid FK              | Tenant                 |
| `research_moment_version_id`                     | uuid FK              | Exact definition       |
| `qualification_evaluation_id`                    | uuid FK              | Why it exists          |
| `commerce_event_id` / `customer_id` / `order_id` | uuid FK              | Context                |
| `script_version_id`                              | uuid FK              | Pinned at creation     |
| `priority`                                       | integer              | Snapshot               |
| `status`                                         | text                 | Queue lifecycle        |
| `assigned_researcher_id`                         | uuid nullable FK     | Claim owner            |
| `claimed_at` / `expires_at` / `completed_at`     | timestamptz nullable | Lifecycle              |
| `attempt_count`                                  | integer              | Operational projection |
| `lock_version`                                   | integer              | Optimistic concurrency |

Unique `(commerce_event_id, research_moment_version_id)` is the MVP idempotency rule. `AssignmentTransition(id, assignment_id, merchant_id, from_status, to_status, actor_type, actor_id, reason_code, occurred_at)` is append-only and preserves queue audit.

## Interview, providers, transcript, and tags

### Interview

| Column                    | Type                 | Notes                                                                |
| ------------------------- | -------------------- | -------------------------------------------------------------------- |
| `id`                      | uuid PK              | One interview attempt/session                                        |
| `merchant_id`             | uuid FK              | Tenant                                                               |
| `research_assignment_id`  | uuid FK              | Parent work item                                                     |
| `researcher_id`           | uuid FK              | Human conductor                                                      |
| `script_version_id`       | uuid FK              | Exact script used                                                    |
| `status`                  | text                 | `created`, `in_progress`, `completed`, `aborted`                     |
| `outcome`                 | text nullable        | `completed`, `declined`, `no_answer`, `partial`, `technical_failure` |
| `started_at` / `ended_at` | timestamptz nullable | Lifecycle                                                            |
| `researcher_notes`        | text nullable        | Treat as sensitive; never log                                        |
| `recording_consent`       | text                 | `not_requested`, `granted`, `declined`, `not_required`               |
| `transcript_status`       | text                 | `not_requested`, `pending`, `ready`, `failed`, `deleted`             |

Do not put `recording_uri` directly on `Interview`; recording lifecycle and retention need their own entity.

### Call

`Call(id, merchant_id, interview_id, provider, provider_call_ref, status, started_at, answered_at, ended_at, normalized_error_code, callback_sequence)` stores normalized telephony lifecycle. Unique `(provider, provider_call_ref)` when present.

### Recording

`Recording(id, merchant_id, interview_id, call_id, provider_ref, object_key, media_type, duration_ms, checksum, status, captured_at, expires_at, deleted_at)` stores opaque private references. Signed URLs are generated on demand and never persisted.

### Transcript

`Transcript(id, merchant_id, interview_id, recording_id, provider, provider_ref, language, status, schema_version, completed_at, expires_at, deleted_at)` separates transcript lifecycle from the interview. Multiple revisions/imports can exist; one may be marked current by an explicit relation after review.

### TranscriptSegment

| Column                           | Type             | Notes                                |
| -------------------------------- | ---------------- | ------------------------------------ |
| `id`                             | uuid PK          | Evidence anchor                      |
| `merchant_id`                    | uuid FK          | Tenant guard                         |
| `transcript_id` / `interview_id` | uuid FK          | Parents                              |
| `sequence`                       | integer          | Unique within transcript             |
| `speaker`                        | text             | `researcher`, `customer`, `unknown`  |
| `start_ms` / `end_ms`            | integer nullable | Media offsets                        |
| `text`                           | text             | Sensitive research content           |
| `provider_confidence`            | numeric nullable | Provider output only                 |
| `redaction_status`               | text             | `unreviewed`, `reviewed`, `redacted` |

### TagDefinition

Stable semantic identity: `id`, nullable `merchant_id` (null means platform), `key`, `name`, `status`. Unique platform key or `(merchant_id, key)` via partial indexes.

### TagDefinitionVersion

| Column                                     | Type           | Notes                                                                                  |
| ------------------------------------------ | -------------- | -------------------------------------------------------------------------------------- |
| `id`                                       | uuid PK        | Immutable semantic version                                                             |
| `tag_definition_id`                        | uuid FK        | Parent                                                                                 |
| `version`                                  | integer        | Unique per definition                                                                  |
| `value_type`                               | text           | `category`, `multi_category`, `boolean`, `text`, `integer`, `decimal`                  |
| `allowed_values`                           | jsonb nullable | Validated option IDs/labels                                                            |
| `instructions`                             | text           | Coding definition                                                                      |
| `attribution_semantic`                     | text nullable  | `self_reported_discovery`, `self_reported_trigger`, `self_reported_influence`, or null |
| `status` / `published_at` / `published_by` | fields         | Revision lifecycle                                                                     |

### InterviewTag

| Column                       | Type                 | Notes                                    |
| ---------------------------- | -------------------- | ---------------------------------------- |
| `id`                         | uuid PK              | Coded answer/finding                     |
| `merchant_id`                | uuid FK              | Tenant                                   |
| `interview_id`               | uuid FK              | Source interview                         |
| `tag_definition_version_id`  | uuid FK              | Exact definition                         |
| `value`                      | jsonb                | Runtime-validated typed envelope         |
| `source`                     | text                 | `human`, `ai_suggested`, `imported`      |
| `review_status`              | text                 | `suggested`, `accepted`, `rejected`      |
| `confidence`                 | numeric nullable     | Optional, never substitutes for evidence |
| `created_by` / `reviewed_by` | uuid nullable        | Audit                                    |
| `reviewed_at`                | timestamptz nullable | Audit                                    |

Use one row per scalar/category answer; multi-select can use multiple rows or a canonical array based on query tests. Accepted human values are never updated in place; corrections create a superseding row linked by `supersedes_interview_tag_id`.

### InterviewTagEvidence

| Column                    | Type             | Notes                                           |
| ------------------------- | ---------------- | ----------------------------------------------- |
| `interview_tag_id`        | uuid FK          | Derived tag                                     |
| `transcript_segment_id`   | uuid FK          | Source evidence                                 |
| `merchant_id`             | uuid FK          | Tenant guard                                    |
| `start_char` / `end_char` | integer nullable | Exact span within segment                       |
| `excerpt_snapshot`        | text nullable    | Optional reviewed/redacted publication snapshot |

Primary key `(interview_tag_id, transcript_segment_id, start_char)`. At least one evidence row is required before an evidence-bearing tag can become `accepted`, enforced in the service transaction and verified by integrity tests.

## Angles and reports

### Angle

Stable identity: `id`, `merchant_id`, `reporting_period_start`, `reporting_period_end`, `category`, and current lifecycle status. Reporting boundaries follow the merchant timezone and are stored as exclusive UTC instants plus a display month.

### AngleRevision

| Column                                         | Type          | Notes                                        |
| ---------------------------------------------- | ------------- | -------------------------------------------- |
| `id`                                           | uuid PK       | Immutable revision once published            |
| `angle_id` / `merchant_id`                     | uuid FK       | Parent/tenant                                |
| `revision`                                     | integer       | Unique per angle                             |
| `title` / `summary`                            | text          | Finding                                      |
| `research_question`                            | text          | Question answered                            |
| `cohort_definition`                            | jsonb         | Validated query/snapshot plus schema version |
| `recommended_action`                           | text nullable | Proposed test/action                         |
| `caveat`                                       | text          | Required before publish                      |
| `status`                                       | text          | `draft`, `review`, `published`, `superseded` |
| `created_by` / `published_by` / `published_at` | fields        | Audit                                        |

### AngleEvidence

`AngleEvidence(id, merchant_id, angle_revision_id, interview_tag_evidence_id, role, display_order)` creates an unbroken path:

```text
AngleRevision -> AngleEvidence -> InterviewTagEvidence
  -> InterviewTag + TranscriptSegment -> Transcript -> Interview
```

Direct transcript evidence without a tag can be supported with a second nullable reference plus an exclusive check constraint, but the first milestone should prefer the tag-backed path.

### AngleMetric

| Column                              | Type             | Notes                                       |
| ----------------------------------- | ---------------- | ------------------------------------------- |
| `id`                                | uuid PK          | Metric statement                            |
| `angle_revision_id` / `merchant_id` | uuid FK          | Parent                                      |
| `name`                              | text             | Human-readable metric                       |
| `population`                        | text             | `commerce_population` or `interview_sample` |
| `numerator` / `denominator`         | numeric nullable | Required for shares/percentages             |
| `value`                             | numeric          | Display value                               |
| `unit`                              | text             | `count`, `percent`, `currency`, `ratio`     |
| `cohort_snapshot`                   | jsonb            | Filters and period                          |
| `calculation_version`               | text             | Reproducibility                             |
| `computed_at`                       | timestamptz      | Audit                                       |

Observed-versus-self-reported comparisons use two metrics with different populations/provenance, grouped by the angle; they do not create a merged attribution field.

### Report

Stable monthly identity.

| Column                        | Type             | Notes                                                     |
| ----------------------------- | ---------------- | --------------------------------------------------------- |
| `id`                          | uuid PK          | Report identity                                           |
| `merchant_id`                 | uuid FK          | Tenant                                                    |
| `period_start` / `period_end` | timestamptz      | Exclusive interval                                        |
| `display_month`               | date             | First local day of month                                  |
| `status`                      | text             | `draft`, `rendering`, `published`, `failed`, `superseded` |
| `current_revision_id`         | uuid nullable FK | Published/current revision                                |

Unique `(merchant_id, period_start, period_end)`.

### ReportRevision

`ReportRevision(id, report_id, merchant_id, revision, title, executive_summary, methodology, sample_notes, template_version, status, created_by, published_by, published_at)` is immutable once published.

`ReportAngle(report_revision_id, angle_revision_id, section, display_order, promoted_to_executive_summary)` pins exact findings. `ReportArtifact(id, report_revision_id, merchant_id, format, object_key, checksum, byte_size, rendered_at, expires_at, deleted_at)` stores private generated outputs.

## Jobs, audit, retention, and deletion

### OutboxEvent / Job

If the selected PostgreSQL worker owns its job table, maintain an application `OutboxEvent(id, aggregate_type, aggregate_id, merchant_id, event_type, payload, schema_version, idempotency_key, correlation_id, created_at, dispatched_at)` for durable domain handoff. Unique `idempotency_key` prevents duplicate enqueue. Payloads use opaque IDs and non-PII data only.

### ProviderCallbackReceipt

`ProviderCallbackReceipt(id, provider, external_event_id, event_type, body_sha256, verification_status, received_at, processed_at, error_code)` deduplicates telephony/transcription callbacks without retaining raw bodies.

### AuditEvent

Append-only `AuditEvent(id, merchant_id nullable, actor_type, actor_id nullable, action, resource_type, resource_id, result, correlation_id, metadata, occurred_at)`. Metadata is allowlisted and non-PII. Sensitive read/decrypt/export/publish/delete actions are included.

### RetentionPolicy / DeletionRequest

`RetentionPolicy` defines durations by PII, recording, transcript, evidence, and report class. `DeletionRequest(id, merchant_id, subject_type, subject_external_ref_hash, request_type, status, due_at, completed_at, legal_hold, error_code)` drives idempotent deletion tasks. A child `DeletionStep` tracks each store/object/provider action. Do not retain the subject's raw contact details as the request key.

## Required indexes and constraints

At minimum:

- Unique Shopify delivery and provider callback IDs.
- Unique commerce source events.
- Unique assignment per event/moment version.
- Unique version numbers per versioned aggregate.
- Queue index on `(merchant_id, status, priority desc, created_at)` with a partial predicate for actionable states.
- Event index on `(merchant_id, event_type, occurred_at desc)`.
- Interview/reporting indexes on `(merchant_id, completed_at)` and reporting periods.
- Evidence foreign keys with restricted deletion until a deletion workflow explicitly redacts/supersedes dependent findings.
- Check `start_ms <= end_ms`, `start_char < end_char`, nonnegative money/counts, period start before end, and numerator not greater than denominator where applicable.

## Material improvements over the brief

1. **Separate ingress receipt from domain event.** The brief's `CommerceEvent.processing_status` mixes an immutable fact with pipeline state. `WebhookReceipt`, jobs, and `QualificationEvaluation` make delivery, normalization, and decision audit independently replayable.
2. **Version Research Moments as well as scripts/tags.** A mutable moment would make historical assignment logic impossible to reproduce. `ResearchMomentVersion` pins rules, allocation, script, and tag targets.
3. **Normalize evidence links.** Arrays of segment IDs and `Angle.evidence_json` cannot enforce tenancy or referential integrity. Join tables produce a queryable provenance chain from report to transcript span.
4. **Separate provider lifecycles.** Calls, recordings, and transcripts have different states, retention, and retries; keeping them off `Interview` prevents vendor coupling and ambiguous partial failures.
5. **Replace `first_order_boolean` with sequence.** `customer_order_sequence` captures first/repeat and remains more informative; evaluation still snapshots the value so later reconciliation does not rewrite history.
6. **Model attribution semantics explicitly.** Observed attribution remains on orders/events, while self-reported discovery/trigger/influence are tag-definition semantics backed by transcript evidence. No combined truth column exists.
7. **Add qualification and transition audit.** `QualificationEvaluation` and `AssignmentTransition` answer why work was or was not created and how it moved through operations.
8. **Make metrics reproducible.** `AngleMetric` requires population, numerator, denominator, filters, and calculation version, preventing unsupported percentages and mixing commerce populations with interview samples.
9. **Add revisioned reports and artifacts.** Published reports/angles can be cited and reproduced; corrections supersede rather than mutate history.
10. **Design deletion and retention as workflows.** Expiry fields alone do not prove provider/object/database deletion. `DeletionRequest`/steps make erasure retryable and auditable.

## First migration slice

Milestone 0 should establish only the tables needed for the synthetic vertical slice plus shared foundations:

`Merchant`, `Customer`, `CustomerPrivate`, `Order`, `OrderLineItem`, `WebhookReceipt`, `CommerceEvent`, `Script`, `ScriptVersion`, `ResearchMoment`, `ResearchMomentVersion`, `ResearchMomentTargetTag`, `QualificationEvaluation`, `ResearchAssignment`, `AssignmentTransition`, `Interview`, `Call`, `Recording`, `Transcript`, `TranscriptSegment`, `TagDefinition`, `TagDefinitionVersion`, `InterviewTag`, `InterviewTagEvidence`, `Angle`, `AngleRevision`, `AngleEvidence`, `AngleMetric`, `Report`, `ReportRevision`, `ReportAngle`, `ReportArtifact`, and the job/outbox/audit tables.

That list is broad because the first milestone intentionally completes the entire product chain. Fields/adapters not exercised by the synthetic path should not be implemented speculatively; use migrations to add them when their milestone begins.
