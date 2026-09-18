# Holler - Codex Multi-Agent Build Prompts

Use `HOLLER_DEV_BRIEF.md` as the shared source of truth.

All agents should:
- read the brief before making changes
- inspect the existing repository before choosing libraries or replacing architecture
- preserve existing conventions when reasonable
- work in isolated branches/worktrees if available
- avoid production PII entirely
- use synthetic fixtures only
- document assumptions
- leave migration notes and tests
- avoid implementing out-of-scope features

---

# Agent 0 - Technical Lead / Integrator

## Mission

Own overall architecture and integration for the Holler MVP.

Do not attempt to implement every feature personally. First inspect the repository, identify the existing stack, and create an implementation plan that divides work cleanly among the specialist agents.

## Primary Responsibilities

1. Read `HOLLER_DEV_BRIEF.md`.
2. Audit the repository:
   - framework
   - deployment model
   - database
   - auth
   - Shopify setup, if any
   - test framework
   - queues/jobs
   - environment/secrets conventions
3. Create or update:
   - `docs/architecture.md`
   - `docs/mvp-plan.md`
   - `docs/data-model.md`
4. Define module boundaries for:
   - Shopify ingestion
   - event normalization
   - research qualification
   - research queue
   - researcher interface
   - interview/transcript storage
   - tagging
   - angles/reporting
5. Define shared TypeScript types/interfaces before multiple agents create incompatible versions.
6. Review specialist-agent output and integrate changes.
7. Keep the product inside MVP scope.

## Key Architecture Constraint

The fundamental pipeline is:

Shopify event
→ normalized CommerceEvent
→ qualification
→ ResearchAssignment
→ researcher workflow
→ Interview
→ Transcript/Tags
→ Angle
→ Report

Do not let provider-specific APIs leak deeply into core domain logic.

## Deliverables

- architecture document
- MVP implementation sequence
- stable shared domain types
- integration branch
- tests for cross-module workflows
- final list of remaining gaps

---

# Agent 1 - Shopify / Event Ingestion

## Mission

Build the Shopify ingestion layer and near-real-time event pipeline.

The first production Research Moment is `order_completed`.

## Requirements

Implement or validate:

### Shopify App Foundation
- app install/auth flow
- required scopes only
- shop identity persisted
- secure secret handling

### Webhooks
- `orders/create`
- HMAC verification using raw request body
- idempotency / duplicate delivery protection
- retry-safe processing
- merchant lookup
- normalized event creation
- structured logs with no customer PII

### Historical Context
Build a minimal sync path for:
- customers
- orders
- products/variants
- line items

Do not build a massive warehouse.

### Normalization
Map Shopify payloads into domain objects:
- Customer
- CustomerPrivate
- Order
- OrderLineItem
- CommerceEvent

Observed attribution fields should be preserved as raw/flexible JSON plus normalized fields where clearly useful.

Self-reported attribution does not belong here.

### Synthetic Test Data
Create fixtures for:
- first-time purchaser
- repeat purchaser
- multiple SKUs
- Meta-attributed order
- Google-attributed order
- direct/unknown attribution
- duplicate webhook
- missing phone number
- canceled/refunded edge cases where relevant

## Security

- production PII must not appear in logs
- secrets via environment/runtime secret store
- development fixtures must be synthetic
- do not expose phone/email unnecessarily outside ingestion/PII boundary

## Deliverables

- working webhook endpoint
- normalized persistence
- idempotency tests
- fixture set
- README explaining local Shopify dev-store testing

---

# Agent 2 - Research Moment / Qualification Engine

## Mission

Build the domain logic that turns commerce events into research opportunities.

## Concepts

A `ResearchMoment` includes:
- merchant
- event type
- active/inactive
- eligibility rules
- priority
- linked script version
- target research tags
- optional weekly allocation constraints

A `ResearchAssignment` is the concrete opportunity created for one customer/event.

## MVP Rules

Support eligibility conditions such as:
- first-time vs repeat customer
- order value min/max
- SKU/product
- customer order count
- observed attribution source
- geography if already available and permitted
- phone available
- event age
- not previously interviewed within configurable period

Design rules as JSON/configurable data, not hardcoded per merchant.

Avoid building a general-purpose rules language.

## Allocation

MVP can use simple deterministic allocation:
- weekly merchant interview target
- target percentage by active Research Moment
- priority
- cap per cohort

Do not implement ML anomaly detection.

Provide a service API such as:

`evaluateCommerceEvent(eventId) -> ResearchAssignment[]`

The evaluation must be:
- deterministic
- idempotent
- auditable

Store why a customer qualified or failed where practical.

## Tests

Include:
- qualifying first-time buyer
- non-qualifying buyer
- repeat buyer
- competing active Research Moments
- weekly cap reached
- duplicate evaluation
- missing phone
- expired opportunity

## Deliverables

- ResearchMoment CRUD/domain service
- qualification engine
- allocation logic
- auditability
- unit/integration tests

---

# Agent 3 - Researcher Operations UI

## Mission

Build the internal interface human researchers use to conduct point-in-time interviews.

This is an operational application, not a client analytics dashboard.

## Core Screen: Live Queue

Show:
- assignment age / time since event
- first name if permitted
- order total
- first vs repeat
- purchased SKU/products
- observed attribution
- research objective
- priority
- call status

Primary action:
- claim/start interview

## Interview Screen

Show:
- merchant/brand
- customer first name
- concise order/customer context
- research objective
- approved script
- current script version
- target tags / research questions

Workflow states:
- queued
- claimed
- dialing
- reached
- declined
- no answer
- completed
- expired

The researcher must be able to:
- follow script in order
- record notes
- mark outcome
- complete interview
- flag a suggested script improvement/fork for review

Do NOT allow researchers to modify the live approved script.

## Privacy

Prefer masked phone display.
Design telephony initiation so the rep does not need raw phone access.

## UX Principle

Speed matters.
For checkout research, the UI should make it obvious how long it has been since the purchase.

## Deliverables

- live queue
- assignment detail
- interview workflow
- script rendering
- outcome handling
- suggestion/feedback mechanism
- tests for state transitions

---

# Agent 4 - Telephony / Recording / Transcription Abstraction

## Mission

Create provider-agnostic infrastructure for outbound calls, recordings, and transcripts.

Do not overfit the domain model to Twilio or any single provider.

## Interfaces

Create abstractions roughly equivalent to:

`TelephonyProvider`
- initiateOutboundCall(...)
- getCallStatus(...)
- endCall(...)
- getRecordingReference(...)

`TranscriptionProvider`
- submitRecording(...)
- getTranscript(...)

Provider-specific adapters may be implemented for the project's chosen initial vendors if credentials/configuration exist.

## Requirements

- caller identity per merchant where supported
- masked phone workflow where feasible
- webhooks/callback verification
- call lifecycle persisted
- recording optional/configurable
- transcript ingestion
- speaker separation if supported
- retries
- provider error handling
- no PII in logs

Do not send raw customer/order metadata to transcription providers unless required.

## Development

Provide a fake provider implementation so the full product can be exercised without making real calls.

The fake provider should simulate:
- ringing
- answered
- no answer
- completed
- recording available
- transcript available

## Deliverables

- provider interfaces
- fake adapter
- optional real initial adapter
- callback endpoints
- tests

---

# Agent 5 - Research Data / Tags / Evidence Model

## Mission

Build the evidence layer that turns interviews into structured, auditable research data without losing the raw source.

## Requirements

Persist:
- Interview
- recording reference
- transcript
- transcript segments
- script version
- research objective
- tags
- tag values
- evidence links from tag → transcript segment(s)

Support:
- platform-level tag definitions
- merchant-specific tag definitions
- versioning
- typed values where useful
- manual tagging initially
- optional AI-suggested tag fields only if clearly isolated and reviewable

Never silently overwrite a human-reviewed tag with an AI value.

## Important Attribution Rule

Store separately:
- observed_attribution
- self_reported_attribution

Do not collapse them into a single "truth" field.

Enable comparisons such as:
- Shopify/observed source = Meta
- self-reported first discovery = creator
- purchase trigger = email
- confidence/evidence

## Deliverables

- schema/migrations
- transcript viewer primitives
- tagging UI/service
- evidence linking
- export format
- tests

---

# Agent 6 - Angles / Monthly Report Builder

## Mission

Build the first version of the Angles Report workflow.

The MVP does NOT need fully autonomous AI reporting.

Build an evidence-backed report builder that lets an internal analyst assemble monthly findings efficiently.

## Core Concepts

An `Angle` contains:
- title
- summary
- cohort definition
- reporting period
- research question
- supporting interview count
- relevant observed metric
- relevant self-reported metric
- supporting quotes/evidence
- suggested action/test
- caveat/confidence note

## Features

### Angle Builder
Allow internal user to:
- select reporting period
- filter interviews/cohorts
- inspect tag distributions
- compare observed vs self-reported attribution
- select supporting evidence
- create/edit Angle
- link interview/transcript evidence

### One-Page Summary
Allow 3-5 Angles to be promoted to executive summary.

### Report Output
Generate a clean HTML/PDF-friendly report containing:
1. executive one pager
2. detailed Angles
3. methodology/sample notes
4. evidence references
5. appendix links/IDs for raw interviews

The client does not need a live dashboard.

## Quantitative Guardrails

Do not calculate percentages without:
- denominator
- sample size
- cohort definition

Clearly distinguish:
- commerce metrics from full merchant population
- interview metrics from sampled interview population

## Deliverables

- angle builder
- report schema
- basic monthly report generation
- evidence backlinks
- tests for aggregation math

---

# Agent 7 - Security / Privacy / Reliability Review

## Mission

Review the MVP specifically for Shopify protected customer data, operational security, and failure modes.

Do not write generic compliance prose. Inspect actual code/configuration.

## Review Areas

### Secrets
- no credentials committed
- env/runtime secret use
- `.env` ignored

### PII
- identify every place phone/name/email/address can appear
- verify no PII logging
- verify error monitoring scrubbing
- verify dev fixtures synthetic
- verify PII separation where designed

### Shopify
- HMAC verification
- OAuth/session handling
- minimum scopes
- webhook idempotency
- privacy webhooks / deletion workflows where applicable

### Authorization
- researcher access
- admin access
- merchant boundaries
- cross-tenant leakage tests

### Data Lifecycle
- retention fields
- deletion path
- audio/transcript lifecycle
- account uninstall handling

### External Providers
- telephony payload minimization
- transcription payload minimization
- callback verification

### Reliability
- webhook retry safety
- queue/job retry safety
- assignment duplication
- stale assignments
- provider outages
- partial interview completion

## Deliverables

Create:
- `docs/security-review.md`
- prioritized remediation list
- automated tests where practical
- explicit launch blockers vs post-MVP improvements

---

# Agent 8 - End-to-End QA / Seed Environment

## Mission

Create a deterministic synthetic demo environment that proves the Holler workflow end to end.

## Seed Scenario

Create a fake merchant doing approximately $30M annualized ecommerce revenue with:
- products/SKUs
- new customers
- repeat customers
- different acquisition sources
- realistic order values
- repeat patterns

Include deliberately misleading observed attribution.

Example:
- observed Meta attribution high
- interviews frequently say creator / WOM discovery
- repeat purchase event increase
- interview responses often cite email reminder
- SKU X buyers commonly cite portability

## Demo Flow

Prove:

1. Fake order occurs.
2. CommerceEvent created.
3. Qualification engine creates ResearchAssignment.
4. Live queue updates.
5. Fake telephony completes interview.
6. Transcript saved.
7. Tags assigned.
8. Observed vs self-reported attribution compared.
9. Angle created.
10. Monthly report generated.

## Deliverables

- seed script
- synthetic dataset
- end-to-end test
- demo instructions
- screenshots optional

---

# Suggested Parallelization

## Phase 1 - Foundation
Run in parallel:
- Agent 0
- Agent 1
- Agent 2
- Agent 5

Agent 0 first establishes shared domain conventions.

## Phase 2 - Operations
Run:
- Agent 3
- Agent 4

## Phase 3 - Output
Run:
- Agent 6

## Phase 4 - Hardening
Run:
- Agent 7
- Agent 8

Agent 0 integrates throughout.

---

# Master Prompt for Codex Orchestrator

You are the technical lead for Holler.

Read `HOLLER_DEV_BRIEF.md` and `CODEX_AGENTS.md` completely before modifying code.

Holler is a point-in-time customer research platform, initially for Shopify ecommerce companies. Its core workflow is:

Shopify event
→ customer/event qualification
→ live human research queue
→ structured interview
→ recording/transcript
→ research tags
→ evidence-backed Angle
→ monthly Angles Report.

The initial commercial value proposition is:

1. Audit attribution to improve marketing spend quality / ROAS.
2. Generate customer-language and messaging feedback to improve creative and marketing effectiveness.

Product feedback and brand affinity are valuable but secondary.

The MVP is intentionally narrow. Do not build an MMM, a general BI platform, an autonomous AI research product, or a live client insights inbox.

Your job is to:

1. Inspect the existing repository and preserve its sensible conventions.
2. Establish shared domain types and architecture.
3. Delegate or parallelize work using the specialist responsibilities in `CODEX_AGENTS.md`.
4. Keep branches/worktrees isolated where supported.
5. Use synthetic data only.
6. Prevent production PII from appearing in prompts, fixtures, logs, source control, or tests.
7. Make Shopify webhooks idempotent and secure.
8. Keep telephony/transcription behind provider interfaces.
9. Preserve raw evidence and make every derived research finding auditable.
10. Treat observed attribution and self-reported attribution as separate data.
11. Version scripts and tag definitions.
12. Prioritize a working end-to-end flow over breadth.

Before significant implementation, produce:
- architecture summary
- dependency map
- proposed database schema
- branch/agent plan
- MVP milestone list

Then implement in small, reviewable increments.

The MVP is complete when a synthetic Shopify order can flow through the full system and appear in a generated monthly Angles Report with source evidence attached.
