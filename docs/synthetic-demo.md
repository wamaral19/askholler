# Canonical Synthetic MVP Demo

## Purpose and status

This document is the acceptance contract for Holler's deterministic synthetic MVP flow. It is owned by Agent 8 and is intentionally implementation-facing: all agents must use these identities and facts rather than inventing incompatible fixtures.

The scenario proves the complete product chain without external credentials, real calls, or production customer data:

```text
synthetic order 2
  -> CommerceEvent
  -> versioned cohort predicates
  -> ResearchAssignment in the live queue
  -> researcher explicitly starts a manual/fake call
  -> Interview + transcript + responses/tags + observations
  -> observed/self-reported attribution comparison
  -> evidence-backed Angle
  -> September 2026 Angles Report
```

All timestamps, IDs, provider responses, and retry decisions are fixed. Tests must use an injected clock and ID source. Human-readable fixture content is fictional. The reserved `.invalid` domain and a North American `555-01xx` fictional number are used; none of this data may be replaced with production PII.

## Fixed execution context

| Item                      | Value                                                  |
| ------------------------- | ------------------------------------------------------ |
| Scenario key              | `juniper-row-repeat-moisturizer-v1`                    |
| Seed/schema version       | `1`                                                    |
| Clock at ingress          | `2026-09-17T14:00:05.000Z`                             |
| Merchant timezone         | `America/New_York`                                     |
| Reporting period          | `[2026-09-01T04:00:00.000Z, 2026-10-01T04:00:00.000Z)` |
| Currency                  | `USD`                                                  |
| Qualification engine      | `cohort-engine-v1`                                     |
| Fake/manual provider seed | `holler-demo-v1`                                       |
| Expected report month     | `2026-09-01`                                           |

The fictional merchant is **Juniper Row**, a multi-category ecommerce brand modeled at `$30,000,000` annualized GMV (`3_000_000_000` minor units). That scale is synthetic dataset metadata, not a claim calculated from the two illustrative orders below. A later volume fixture may expand the population while preserving this scenario unchanged.

## Stable IDs

The UUIDs are application-assigned UUID-shaped deterministic fixture IDs. Implementations may brand them as opaque ID types, but must preserve these values in seed/test environments.

### Tenant, actor, catalog, and commerce

| Entity                         | Stable ID / external key                                                    |
| ------------------------------ | --------------------------------------------------------------------------- |
| Merchant                       | `00000000-0000-7000-8000-000000000001`                                      |
| Shopify shop                   | `gid://shopify/Shop/900000000001`                                           |
| Researcher                     | `00000000-0000-7000-8000-000000000002`                                      |
| Customer                       | `00000000-0000-7000-8000-000000000101`                                      |
| Shopify customer               | `gid://shopify/Customer/900000000101`                                       |
| CustomerPrivate                | same one-to-one customer ID                                                 |
| Category: tops                 | `00000000-0000-7000-8000-000000000201` / `merchant:tops`                    |
| Category: skincare             | `00000000-0000-7000-8000-000000000202` / `merchant:skincare`                |
| Category: socks                | `00000000-0000-7000-8000-000000000203` / `merchant:socks`                   |
| Product: Harbor Tee            | `00000000-0000-7000-8000-000000000211`                                      |
| Variant: Harbor Tee / navy / M | `00000000-0000-7000-8000-000000000212` / `JR-TEE-NV-M`                      |
| Product: Cloud Dew Moisturizer | `00000000-0000-7000-8000-000000000221`                                      |
| Variant: Cloud Dew / 50 ml     | `00000000-0000-7000-8000-000000000222` / `JR-CDM-50`                        |
| Product: Trail Crew Socks      | `00000000-0000-7000-8000-000000000231`                                      |
| Variant: Trail Crew / oat / M  | `00000000-0000-7000-8000-000000000232` / `JR-SOCK-OAT-M`                    |
| First order                    | `00000000-0000-7000-8000-000000000301` / `gid://shopify/Order/900000000301` |
| First-order line item          | `00000000-0000-7000-8000-000000000311`                                      |
| Second order                   | `00000000-0000-7000-8000-000000000302` / `gid://shopify/Order/900000000302` |
| Second-order line item         | `00000000-0000-7000-8000-000000000312`                                      |
| Webhook receipt                | `00000000-0000-7000-8000-000000000401`                                      |
| Shopify delivery ID            | `00000000-0000-4000-8000-000000009001`                                      |
| CommerceEvent                  | `00000000-0000-7000-8000-000000000402`                                      |
| Commerce source event ID       | `shopify:orders-create:900000000302`                                        |
| Correlation ID                 | `00000000-0000-7000-8000-000000000403`                                      |

Current catalog assignments are Harbor Tee -> `tops`, Cloud Dew Moisturizer -> `skincare`, and Trail Crew Socks -> `socks`. Category membership is resolved from the **current product catalog at evaluation time**. `OrderLineItem` must not carry a category snapshot. The qualification evaluation still preserves the non-PII inputs and reason codes used for its historical decision.

### Research configuration and workflow

| Entity                             | Stable ID                              |
| ---------------------------------- | -------------------------------------- |
| Script                             | `00000000-0000-7000-8000-000000000501` |
| ScriptVersion 1                    | `00000000-0000-7000-8000-000000000502` |
| ResearchMoment                     | `00000000-0000-7000-8000-000000000511` |
| ResearchMomentVersion 1            | `00000000-0000-7000-8000-000000000512` |
| Effective ResearchFieldSetVersion  | `00000000-0000-7000-8000-000000000513` |
| QualificationEvaluation            | `00000000-0000-7000-8000-000000000521` |
| ResearchAssignment                 | `00000000-0000-7000-8000-000000000522` |
| Interview                          | `00000000-0000-7000-8000-000000000531` |
| Manual/fake Call                   | `00000000-0000-7000-8000-000000000532` |
| Recording                          | `00000000-0000-7000-8000-000000000533` |
| Transcript                         | `00000000-0000-7000-8000-000000000534` |
| Researcher observation             | `00000000-0000-7000-8000-000000000535` |
| Script prompt: discovery           | `00000000-0000-7000-8000-000000000551` |
| Script prompt: trigger             | `00000000-0000-7000-8000-000000000552` |
| Script prompt: moisturizer texture | `00000000-0000-7000-8000-000000000553` |

### Evidence, insight, and report

| Entity                                    | Stable ID                              |
| ----------------------------------------- | -------------------------------------- |
| InterviewTag: discovery source            | `00000000-0000-7000-8000-000000000601` |
| InterviewTag: purchase trigger            | `00000000-0000-7000-8000-000000000602` |
| InterviewTag: Meta influence              | `00000000-0000-7000-8000-000000000603` |
| InterviewResponse: moisturizer liquidity  | `00000000-0000-7000-8000-000000000604` |
| InterviewResponse: moisturizer absorption | `00000000-0000-7000-8000-000000000605` |
| Evidence: creator discovery               | `00000000-0000-7000-8000-000000000611` |
| Evidence: Meta non-influence              | `00000000-0000-7000-8000-000000000612` |
| Evidence: email trigger                   | `00000000-0000-7000-8000-000000000613` |
| Evidence: ideal liquidity                 | `00000000-0000-7000-8000-000000000614` |
| Evidence: absorption rating               | `00000000-0000-7000-8000-000000000615` |
| Angle                                     | `00000000-0000-7000-8000-000000000701` |
| AngleRevision 1                           | `00000000-0000-7000-8000-000000000702` |
| AngleEvidence: creator                    | `00000000-0000-7000-8000-000000000721` |
| AngleEvidence: email                      | `00000000-0000-7000-8000-000000000722` |
| AngleMetric: observed Meta                | `00000000-0000-7000-8000-000000000731` |
| AngleMetric: reported creator             | `00000000-0000-7000-8000-000000000732` |
| Report                                    | `00000000-0000-7000-8000-000000000711` |
| ReportRevision 1                          | `00000000-0000-7000-8000-000000000712` |
| HTML ReportArtifact                       | `00000000-0000-7000-8000-000000000713` |
| ReportAngle                               | `00000000-0000-7000-8000-000000000741` |

## Catalog and order history

The customer is synthetic **Casey Example**, with `casey@juniper-row.example.invalid` and `+1-202-555-0142`. Plaintext is permitted only inside the synthetic ingress/PII-boundary fixture. It must be encrypted at persistence, must not appear in logs or report artifacts, and must be hidden in the queue until an authorized researcher explicitly starts the manual call flow.

Order history is deterministic:

| Sequence | Ordered at                 | Items                     | Current categories |    Total | Observed attribution                                                                                |
| -------- | -------------------------- | ------------------------- | ------------------ | -------: | --------------------------------------------------------------------------------------------------- |
| 1        | `2026-08-14T16:30:00.000Z` | 1 x Harbor Tee            | `tops`             | `$48.00` | `direct`                                                                                            |
| 2        | `2026-09-17T14:00:00.000Z` | 1 x Cloud Dew Moisturizer | `skincare`         | `$64.00` | normalized source `meta`, channel `paid_social`, campaign `cloud-dew-retargeting`, last-touch model |

The first order is seeded historical context. The second arrives through the signed synthetic `orders/create` fixture and is the only order that creates the canonical `CommerceEvent`.

## Extensible cohort definition

The active moment is **Second purchase into skincare**, event type `order_completed`, priority `80`. Its immutable version pins the script and effective research field-set versions. The rule is a versioned JSON expression tree composed from registered predicates:

```json
{
  "schemaVersion": 1,
  "all": [
    {
      "predicate": "customer.order_sequence",
      "version": 1,
      "config": { "operator": "equals", "value": 2 }
    },
    {
      "predicate": "history.order_at_sequence.contains_current_category",
      "version": 1,
      "config": {
        "sequence": 1,
        "categoryKey": "merchant:skincare",
        "expected": false
      }
    },
    {
      "predicate": "order.contains_current_category",
      "version": 1,
      "config": { "categoryKey": "merchant:skincare", "expected": true }
    },
    {
      "predicate": "customer.contactability",
      "version": 1,
      "config": { "channel": "phone", "expected": "eligible" }
    }
  ]
}
```

Each registered predicate must own its config validation, deterministic evaluator, human-readable explanation, and optional tenant-safe parameterized query compiler. Adding a predicate can add application logic without a `ResearchMoment` table migration. Arbitrary user SQL is not accepted. The expected positive reason codes are:

```text
ORDER_SEQUENCE_EQUALS_2
FIRST_ORDER_EXCLUDES_CURRENT_CATEGORY_SKINCARE
CURRENT_ORDER_INCLUDES_CURRENT_CATEGORY_SKINCARE
PHONE_CONTACT_ELIGIBLE
ALLOCATION_AVAILABLE
```

The evaluation outcome is `qualified`; it creates exactly one queued assignment. A catalog recategorization after evaluation does not revoke or rewrite that assignment. A fresh evaluation of a later event uses then-current category assignments.

## Research fields and versioned field set

Research fields define what a run asks and are distinct from cohort predicates, which define who enters it. Platform-default fields are composed with merchant defaults and run-specific fields at publication into immutable `ResearchFieldSetVersion ...0513`. Completed values are stored as version-pinned interview responses and, where used for reporting taxonomy, evidence-backed tags.

The registry includes these stable version IDs:

| Scope                      | Key                             | Version ID                             | Type / options                                                                                | Effective in this run? |
| -------------------------- | ------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------- |
| Platform default           | `attribution.discovery_source`  | `00000000-0000-7000-8000-000000000541` | single select: `creator`, `word_of_mouth`, `meta`, `google`, `other`, `unknown`               | Yes                    |
| Platform default           | `attribution.purchase_trigger`  | `00000000-0000-7000-8000-000000000542` | single select: `email`, `sms`, `paid_ad`, `organic`, `planned_repurchase`, `other`, `unknown` | Yes                    |
| Platform default           | `attribution.influence`         | `00000000-0000-7000-8000-000000000543` | multi select                                                                                  | Yes                    |
| Platform default           | `purchase.primary_motivation`   | `00000000-0000-7000-8000-000000000544` | short text                                                                                    | Yes                    |
| Run-specific               | `moisturizer.texture_liquidity` | `00000000-0000-7000-8000-000000000545` | single select: `too_runny`, `ideal`, `too_thick`, `not_sure`                                  | Yes                    |
| Run-specific               | `moisturizer.absorption`        | `00000000-0000-7000-8000-000000000546` | rating 1-5                                                                                    | Yes                    |
| Run-specific library field | `socks.cushioning`              | `00000000-0000-7000-8000-000000000547` | single select: `light`, `medium`, `heavy`, `not_sure`                                         | **No**                 |
| Run-specific library field | `socks.compression`             | `00000000-0000-7000-8000-000000000548` | rating 1-5                                                                                    | **No**                 |

Assertions must prove that the interview renders the six effective fields, does not render either sock field, and remains pinned to the same set if a draft field is later added or removed. A separate future socks Research Moment can compose the same defaults with the sock fields without a schema change.

## Human-controlled call and transcript

Qualification never places a call. Before researcher action, expected counts are `ResearchAssignment=1`, `Interview=0`, and `Call=0`. The researcher claims the assignment, then clicks **Start call**. For the MVP this creates an interview/manual attempt, performs an audited synthetic phone reveal/copy, and lets the researcher dial manually; the deterministic fake adapter may simulate lifecycle events for E2E coverage. A future RingCentral adapter must implement the same provider port and must not alter cohort, assignment, or interview domain logic.

Expected lifecycle and timestamps:

```text
assignment queued   2026-09-17T14:00:06Z
assignment claimed  2026-09-17T14:02:00Z
start-call click    2026-09-17T14:02:05Z
interview reached   2026-09-17T14:02:12Z
interview completed 2026-09-17T14:08:00Z
transcript ready    2026-09-17T14:08:05Z
```

The fake transcript has these stable segments:

| Seq / stable ID                              | Speaker    | Offset | Exact synthetic text                                                                | Expected evidence use                      |
| -------------------------------------------- | ---------- | -----: | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| `1` / `00000000-0000-7000-8000-000000000561` | researcher |   0-9s | `What first introduced you to Juniper Row?`                                         | prompt context                             |
| `2` / `00000000-0000-7000-8000-000000000562` | customer   | 10-24s | `I first found the brand through a creator review, not through a Meta ad.`          | discovery=`creator`; Meta influence=`none` |
| `3` / `00000000-0000-7000-8000-000000000563` | researcher | 25-34s | `What prompted today's purchase?`                                                   | prompt context                             |
| `4` / `00000000-0000-7000-8000-000000000564` | customer   | 35-50s | `The restock email reminded me, and that is when I decided to buy the moisturizer.` | trigger=`email`                            |
| `5` / `00000000-0000-7000-8000-000000000565` | researcher | 51-61s | `How did the moisturizer texture feel?`                                             | run-field context                          |
| `6` / `00000000-0000-7000-8000-000000000566` | customer   | 62-78s | `The texture felt ideal to me, and absorption was a five out of five.`              | liquidity=`ideal`; absorption=`5`          |

Evidence spans use zero-based, half-open character offsets: creator discovery is segment `...0562` `[34,48)`, Meta non-influence is `...0562` `[50,71)`, email trigger is `...0564` `[12,17)`, ideal liquidity is `...0566` `[17,22)`, and absorption rating is `...0566` `[51,67)`. Accepted tags/responses never link only to the entire interview.

During the texture question, at offset `00:01:04`, the researcher records observation `notable_excitement` with note `Voice became faster and more animated when describing the texture.` It links to the interview, researcher, current script prompt, and timestamp. This is researcher-observed evidence, not a customer quote and not a transcript-derived fact. AI suggestions may supplement but never overwrite it or a human-reviewed response.

## Expected ten-step records and assertions

| Step | Required result                            | Canonical assertions                                                                                                                       |
| ---: | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
|    1 | Second synthetic order received            | Verified receipt `...0401`; body hash stored; body/PII absent from logs                                                                    |
|    2 | CommerceEvent created                      | One event `...0402`, type `order_completed`, observed source `meta`, order sequence `2`                                                    |
|    3 | Qualification evaluates                    | One evaluation `...0521`, `qualified`, exact predicate versions/input snapshot/reason codes recorded                                       |
|    4 | Assignment created                         | One assignment `...0522`, `queued`, pinned to moment/script/field-set versions                                                             |
|    5 | Queue displays it                          | Shows event age, repeat/second-order context, skincare product, objective and observed Meta; creates no call automatically                 |
|    6 | Researcher completes fake/manual interview | Explicit claim and Start-call action; valid audited transitions; immutable script and field set displayed                                  |
|    7 | Transcript and coding stored               | One transcript, six ordered segments, three accepted attribution tags, run-specific responses, and one nonverbal observation               |
|    8 | Attribution compared                       | Observed `meta` remains on order/event; self-reported discovery=`creator`, trigger=`email`, Meta influence=`none`; no merged truth field   |
|    9 | Angle created                              | Published revision titled `Meta captured the session; creator discovery and email drove the journey`, linked to creator and email evidence |
|   10 | Monthly report generated                   | One private September HTML artifact with executive summary, detailed Angle, methodology/caveat, sample/population labels, and evidence IDs |

The canonical Angle has two explicitly separate metrics:

- Commerce population: observed Meta-attributed qualifying orders, numerator `1`, denominator `1`, unit `percent`, value `100`, cohort `juniper-row-repeat-moisturizer-v1`.
- Interview sample: completed interviews reporting creator discovery, numerator `1`, denominator `1`, unit `percent`, value `100`, same cohort and period but population `interview_sample`.

Its required caveat is: `This synthetic one-interview sample demonstrates provenance and comparison behavior; it is not statistically representative.` The recommended action is: `Test creator-led discovery creative and distinguish discovery from email purchase triggers in attribution reviews.` Every claim in the Angle must resolve through `AngleEvidence -> InterviewTagEvidence/InterviewResponseEvidence -> TranscriptSegment -> Transcript -> Interview`. The report must not expose the synthetic name, email, phone, recording URL, or transcript prose beyond an explicitly selected, reviewed evidence excerpt.

## Expected final cardinalities

After one clean run:

| Record                                            |           Count |
| ------------------------------------------------- | --------------: |
| Merchant / Customer / CustomerPrivate             |     `1 / 1 / 1` |
| Product / Variant / current CategoryAssignment    |     `3 / 3 / 3` |
| Order / OrderLineItem                             |         `2 / 2` |
| WebhookReceipt / CommerceEvent                    |         `1 / 1` |
| QualificationEvaluation / ResearchAssignment      |         `1 / 1` |
| Interview / Call / Recording / Transcript         | `1 / 1 / 1 / 1` |
| TranscriptSegment / InterviewObservation          |         `6 / 1` |
| Accepted attribution InterviewTag                 |             `3` |
| Run-specific InterviewResponse                    |             `2` |
| Angle / published AngleRevision                   |         `1 / 1` |
| Report / published ReportRevision / HTML artifact |     `1 / 1 / 1` |

Draft configuration rows and append-only transition/audit/outbox/job rows are excluded from this cardinality table; their counts depend on the selected worker library, but their semantic events must be asserted.

## Duplicate, retry, and negative cases

These cases are part of the scenario contract, not optional hardening:

1. **Duplicate delivery:** submit the identical delivery ID and body twice. Both requests return the documented idempotent success, but only one receipt, event, evaluation, and assignment exists.
2. **Normalization retry:** fail after commerce upserts but before job acknowledgement. Re-running produces the same order/line/event IDs and no duplicate outbox effect.
3. **Qualification retry/concurrency:** execute the same event/version/engine evaluation twice, including concurrently. Unique keys yield one evaluation effect and one assignment.
4. **Queue claim race:** two authorized synthetic researchers claim `...0522` concurrently. Exactly one wins; the loser receives a typed conflict and no interview is created.
5. **No automatic dialing:** run workers to idle without clicking Start call. Assignment remains actionable and interview/call counts remain zero.
6. **Transcript retry:** deliver the same fake provider transcript callback twice and fail once before acknowledgement. One current transcript with six segments and one set of evidence-backed accepted values results.
7. **Human/AI precedence:** submit an AI suggestion that conflicts with discovery=`creator`. It remains `suggested` or is rejected; it never updates/supersedes the accepted human value automatically.
8. **Render retry:** fail after writing the deterministic artifact but before job acknowledgement. Replay converges on one published report revision and one artifact identity/checksum.
9. **Current-category positive/negative:** before evaluating a fresh cloned event, moving Cloud Dew out of `skincare` makes the current-order predicate fail; restoring it makes the rule pass. Existing evaluation `...0521` and assignment `...0522` remain unchanged.
10. **Field composition:** activating the moisturizer run includes `...0545` and `...0546` and excludes sock fields `...0547`/`...0548`. Publishing a new field-set revision does not mutate the existing assignment/interview.
11. **Evidence integrity:** accepting an evidence-bearing tag/response without a segment/span fails. Publishing the Angle after its evidence is redacted fails or marks the finding unsupported according to the shared integrity contract.
12. **PII/log guard:** capture logs, errors, traces, report HTML, and job payloads and assert absence of `Casey Example`, the full phone, the email, and raw webhook body. Logs/errors/traces/job payloads contain no interview text; report HTML may contain only the deliberately selected reviewed evidence excerpt.

## Eventual demo command contract

The repository must eventually expose one stable root command:

```sh
npm run demo:synthetic
```

Contract:

- Requires only the documented local runtime and an empty/reusable local PostgreSQL database; no Shopify, telephony, transcription, object-storage, or AI credentials.
- Applies migrations, resets **only the named synthetic scenario tenant** in a safe idempotent manner, seeds fixed historical/configuration records, submits the signed second-order fixture, drains deterministic jobs, and starts or reuses the local app.
- Exercises the human control point through browser automation: observe queue -> claim -> click Start call -> complete interview -> review evidence -> create Angle -> generate report. It must not bypass the UI/service transition merely to make the test pass.
- Prints only non-PII stable IDs, state transitions, local authorized routes, and the report checksum. It never prints the fixture phone/email, raw payload, transcript, secret, or public artifact URL.
- Exits `0` only after the ten steps and all provenance/idempotency assertions pass; exits nonzero with a safe categorical stage/error code otherwise.
- Re-running the command converges on the same canonical records and report checksum rather than appending duplicate business records.

The persisted database verification command is:

```sh
TEST_DATABASE_URL=postgresql://localhost/holler_test npm run demo:synthetic:persisted
```

It creates and migrates an isolated schema, seeds the fixed records idempotently, verifies cardinality and provenance, and removes only that schema. Without a configured database URL the database cases report as skipped; the in-memory command remains credential-free.

Useful subordinate commands may be added, but their names must not replace the root contract:

```sh
npm run demo:synthetic
npm run demo:synthetic:persisted
```

The final success summary should be machine-readable JSON equivalent to:

```json
{
  "scenario": "juniper-row-repeat-moisturizer-v1",
  "commerceEvents": 1,
  "assignments": 1,
  "interviews": 1,
  "angles": 1,
  "reports": 1,
  "observedAttribution": "meta",
  "selfReportedDiscovery": "creator",
  "selfReportedTrigger": "email",
  "evidenceIntegrity": "passed",
  "idempotency": "passed",
  "piiLeakCheck": "passed"
}
```

## Ownership and change control

Agent 0 owns shared domain contracts and migration compatibility. Agents 1-6 consume this scenario's IDs and semantics in their module fixtures; Agent 7 owns security assertions; Agent 8 owns orchestration and acceptance. A semantic change to the scenario requires incrementing the seed/schema version and coordinating all consumers. Cosmetic UI copy may change without changing the fixture contract, but attribution semantics, category resolution, predicate versions, field-set composition, evidence paths, and idempotency expectations may not silently drift.
