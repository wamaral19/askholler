# Holler MVP Implementation Plan

## Goal and sequencing rule

The MVP is complete when a Shopify merchant can install Holler, new orders can safely enter the system, eligible customers appear in a live human-research queue, completed interviews become auditable evidence, and an internal analyst can publish a monthly Angles Report that traces every finding to that evidence.

Implementation follows a vertical-slice rule: establish the smallest shared contracts first, then make the complete synthetic path work before expanding production integrations. No broad feature work starts until the architecture/data model and shared types are reviewed.

## Repository assessment

As of 2026-09-17 the repository is greenfield. It has no commits and contains only `HOLLER_DEV_BRIEF.md`, `CODEX_AGENTS.md`, and these planning documents. There is no existing framework, deployment, database, authentication, Shopify integration, test framework, job system, or secrets convention. The remote is configured as `https://github.com/wamaral19/holler.git` (repository spelling differs from the product name).

Therefore, all stack choices in the architecture are proposals. There are no sensible code conventions to replace; the brief's scope, privacy, evidence, and provider-boundary conventions are preserved as requirements.

## Gate 0: architecture approval and shared contract freeze

This is a short integration gate, not a product milestone. Technical Lead owns it before parallel implementation.

### Deliverables

- Approve or amend `docs/architecture.md`, `docs/data-model.md`, and this plan.
- Record ADRs for application framework, ORM/migration tool, job runner, deployment target, and internal identity provider.
- Scaffold the TypeScript workspace, formatting/lint/typecheck/test commands, `.gitignore`, `.env.example`, and typed configuration loader.
- Define shared domain contracts and runtime schemas for IDs, timestamps, money, observed attribution, commerce event, eligibility rules, assignment/interview states, scripts/tags, provider ports, evidence refs, angle metrics, and report render model.
- Establish deterministic clock/ID interfaces and synthetic factories.
- Establish migration ownership and one initial schema/migration; prohibit agents from independently redefining shared tables/enums.
- Add CI for install, lint, typecheck, unit tests, migration check, and secret/PII fixture guard.

### Acceptance criteria

- A clean checkout can run one documented setup command and all checks locally.
- Web and worker processes start against an empty local PostgreSQL database.
- One migration command produces the expected schema from zero.
- Fake provider contracts compile without vendor SDKs.
- No `.env`, token, real-looking customer fixture, phone, or email is tracked.
- Shared contracts have an owner and change-review rule.

## Milestone 1: complete synthetic vertical slice

This is the first product milestone and must culminate in the requested ten-step working flow. It intentionally uses a synthetic ingress and fake telephony/transcription first; an optional Shopify development-store webhook may also drive the same normalization port if credentials are available.

### Dependencies

Gate 0 is complete. No real customer PII, live phone call, or production credential is required.

### Scope and ordered implementation

1. Seed one synthetic merchant, customer/private envelope, published order-completed Research Moment, published script version, and published attribution/tag definitions.
2. Accept a signed synthetic webhook fixture (or verified dev-store `orders/create`) through the ingress adapter and persist a deduplicated receipt.
3. Normalize the payload into customer/order/line items and one immutable `CommerceEvent` with observed attribution.
4. Dispatch and run deterministic qualification; persist its reason codes and create one idempotent `ResearchAssignment`.
5. Render a role-protected researcher queue and atomically claim the assignment.
6. Run a fake call/interview through valid state transitions and complete it against the pinned script version.
7. Persist a synthetic transcript, transcript segments, reviewed tag values, and exact evidence links.
8. Show an attribution comparison with observed source (order/event) separate from self-reported discovery source, purchase trigger, and influence (evidence-backed tags).
9. Create an Angle revision with at least one evidence link, separate population metrics, denominator/sample size, action, and caveat.
10. Generate a private monthly HTML Angles Report with executive summary, detailed angle, methodology/sample notes, and evidence references.

### Acceptance criteria

- A single documented demo command seeds/runs the flow from fake order to report without external credentials.
- The assignment appears in the researcher queue within a local target of 10 seconds.
- Replaying the same ingress delivery and qualification job creates no duplicate event or assignment.
- Injecting one retry at normalization, qualification, transcript, and render stages still yields one correct final result.
- Queue claim concurrency has a database integration test proving a single winner.
- The interview displays the immutable script version used.
- Every accepted tag links to at least one transcript segment/span.
- The comparison UI/export never overwrites or aliases observed attribution as self-reported attribution.
- Every published Angle traces through tag evidence to a transcript segment and interview.
- Every percentage in the report includes numerator, denominator, sample population, period, and cohort definition.
- Generated artifacts and logs contain no raw phone, email, name beyond an explicitly synthetic display value, access token, or webhook body.
- Playwright (or equivalent) covers the ten-step happy path; database tests cover idempotency and evidence integrity.

### Demo dataset

Use a deterministic fictional merchant and reserved synthetic contact data. The initial order should be observed as Meta-attributed while the fake interview reports creator discovery and email as the purchase trigger. This makes the core commercial comparison visible in one run. Add first/repeat and multiple-SKU variants after the primary path passes.

## Milestone 2: production-grade Shopify foundation

### Dependencies

Milestone 1 normalization and commerce contracts are stable; Shopify distribution model and protected-data access path are decided.

### Scope

- Create the Shopify app using official current tooling and minimum scopes.
- Implement install/auth/token lifecycle and encrypted offline credential storage.
- Configure `orders/create`, uninstall, and mandatory privacy/compliance webhooks.
- Verify HMAC over raw body, deduplicate by delivery ID, respond after durable receipt, and process asynchronously.
- Map real dev-store payloads through the existing normalization port, including missing/redacted fields.
- Add a bounded historical import and incremental reconciliation cursor for orders/customers/products needed by qualification.
- Document local tunnel/dev-store testing with synthetic Shopify records only.

### Acceptance criteria

- Install/uninstall succeeds on a Shopify development store.
- Valid orders create the same domain records as the synthetic adapter; invalid HMAC receives 401 and creates no trusted receipt/event.
- Duplicate/out-of-order deliveries and reconciliation overlap are safe.
- Webhook response meets Shopify timing requirements because expensive work is asynchronous.
- Required privacy topics are verified and create auditable deletion/data-request workflows.
- Scopes and requested protected fields are documented and demonstrably minimal.
- No payload/PII appears in logs, errors, traces, or fixtures.

## Milestone 3: research configuration, qualification, and allocation

### Dependencies

Shopify event contract and shared versioning models are stable.

### Scope

- Internal CRUD/publish workflow for scripts, tag-definition versions, and Research Moment versions.
- Validated MVP eligibility-rule editor/schema.
- First-time/repeat, value, SKU/product, order count, observed source, phone eligibility, event age, and cooldown rules.
- Deterministic weekly target, per-moment weight/cap, priority, and stable tie-break allocation.
- Qualification audit/explanation UI and operational replay for safe failed evaluations.

### Acceptance criteria

- Published versions are immutable and assignments pin exact versions.
- Tests cover qualifying/non-qualifying first and repeat buyers, competing moments, caps, duplicate evaluation, missing phone, cooldown, and expired opportunity.
- Allocation is deterministic for the same inputs and explains qualified, rejected, capped, and suppressed outcomes.
- No general-purpose rules language or anomaly detection is introduced.

## Milestone 4: researcher operations and provider lifecycle

### Dependencies

Assignment transitions, auth roles, PII service boundary, and provider interfaces are stable.

### Scope

- Production-quality live queue filters/order/age indicators and assignment detail.
- Claim/release/retry/expire flows with transition audit and stale-claim recovery.
- Read-only script runner, target tags/questions, notes, outcomes, and script feedback.
- Fake provider lifecycle finalized; selected real telephony adapter added only after legal/product approval.
- Verified provider callbacks, normalized calls, optional consent-gated recording, object storage, transcription adapter, and manual fallback.

### Acceptance criteria

- Researchers cannot access ungranted merchants or raw phone numbers.
- Invalid state transitions and duplicate callbacks are rejected/idempotent.
- Provider outage/retry, no answer, decline, partial interview, transcription failure, and recording-disabled flows recover cleanly.
- Telephony/transcription SDK types do not appear in core domain or UI contracts.
- Recording consent and jurisdiction policy are configured and reviewed before a live call is enabled.

## Milestone 5: evidence workspace and attribution audit

### Dependencies

Interview/transcript lifecycle and versioned tag definitions are stable.

### Scope

- Transcript viewer with segment/span selection.
- Manual tagging, corrections by supersession, reviewer workflow, and platform/merchant tag definitions.
- Explicit self-reported discovery, trigger, and influence views alongside observed attribution.
- Exportable, tenant-scoped interview research dataset with opaque evidence identifiers.
- Retention/redaction behavior for transcript evidence and recordings.

### Acceptance criteria

- Accepted research tags have evidence; deleting/redacting evidence cannot leave a published finding silently unsupported.
- Human-reviewed tags cannot be overwritten by AI/imports.
- Version used at interview time is visible and retained.
- Attribution comparison labels source, sample, cohort, and missing/unknown values accurately.
- Exports are authorized, audited, private, and contain only approved fields.

## Milestone 6: analyst Angle builder and monthly reports

### Dependencies

Evidence integrity and attribution comparison are complete.

### Scope

- Period/cohort filters and tag distributions for internal analysts.
- Draft/review/publish Angle workflow with selected evidence and metrics.
- 3-5 finding executive summary and detailed Angle ordering.
- Versioned HTML report template, private artifact delivery, and optional PDF rendering.
- Corrections through superseding revisions, not mutation.

### Acceptance criteria

- Publishing refuses an Angle without evidence and a caveat; percentage metrics require numerator/denominator/population.
- Commerce-population metrics and interview-sample metrics are visibly distinct.
- A monthly report is reproducible from pinned angle revisions and template version.
- Evidence backlinks resolve for authorized users and never expose public object URLs.
- Report generation is retry-safe, and a failed render leaves the prior published revision intact.

## Milestone 7: privacy, security, reliability, and pilot readiness

### Dependencies

All production flows exist in staging. Legal/product decisions for contact and recording are documented.

### Scope

- Threat model and concrete security review against implemented code.
- Cross-tenant, role, callback-signature, HMAC, CSRF/session, PII-redaction, and deletion tests.
- Retention sweeps, customer/shop deletion, uninstall, provider/object deletion, legal hold, and auditable completion.
- Backup/restore drill, key rotation drill, dead-letter inspection/replay, reconciliation, stuck-state sweeper, alerts, runbooks, and SLOs.
- Synthetic staging load and failure injection; no production customer data until launch gates pass.

### Acceptance criteria

- Agent 7 identifies zero unresolved launch-blocker findings or each has an accepted owner/date.
- A tenant-isolation test suite covers every tenant-scoped repository/service.
- Deletion and retention complete across database, object storage, and external providers and can be demonstrated from audit records.
- Restore and replay recover a synthetic interrupted flow without duplicates.
- Logs/traces/error monitoring pass automated PII leakage tests.
- On-call runbooks cover webhook backlog, worker failure, provider outage, stuck assignments, and failed report render.

## Dependency map

```text
Architecture/data model
        |
        v
Gate 0: shared contracts + schema + testkit + CI
        |
        v
Milestone 1 synthetic vertical slice
        |
        +-----------> Shopify production ingress (M2)
        |
        +-----------> Moments/qualification depth (M3)
        |                         |
        +-------------------------+
                                  v
                    Research operations/providers (M4)
                                  |
                                  v
                       Evidence/attribution (M5)
                                  |
                                  v
                         Angles/reports (M6)
                                  |
                                  v
                    Security/reliability/pilot (M7)
```

Milestone 1 creates thin implementations across all modules; later milestones harden those seams rather than creating a second path.

## Specialist-agent implementation plan

Agents work in isolated `codex/*` branches/worktrees after Gate 0. Technical Lead owns integration order, migrations, shared contracts, and changes that span modules. An agent does not change a shared type or migration owned by another agent without an approved coordination note/ADR.

### Shared files/types required before parallel work

Technical Lead (Agent 0) establishes these first:

- Root workspace/package manager config, TypeScript config, lint/format/test config, and CI.
- `packages/domain` opaque ID types, money/time primitives, tenant/actor context, and error/result conventions.
- State unions and transition contracts for assignments, interviews, calls, transcripts, angles, and reports.
- Runtime schemas for `ObservedAttributionV1`, `CommerceEventV1`, `EligibilityRulesV1`, `AllocationPolicyV1`, `ScriptContentV1`, `TagValueV1`, `CohortDefinitionV1`, and `ReportRenderModelV1`.
- Ports: `CommerceIngress`, `JobDispatcher`, `Clock`, `IdGenerator`, `PrivateObjectStore`, `CustomerPrivateService`, `TelephonyProvider`, and `TranscriptionProvider`.
- Database schema ownership map, migration rules, transaction/repository interfaces, and test database harness.
- Synthetic fixture factories and canonical seed IDs/scenario.
- Route/service authorization conventions and non-PII logging fields.

These are the compatibility boundary. UI view models may be module-specific; raw ORM rows and vendor SDK types must not become shared API contracts.

### Milestone 1 work allocation

| Agent                    | Slice                                                                                                  | Starts after                                        | Integration dependency                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Agent 0: Lead            | Scaffold, shared contracts, schema/migrations, job/outbox, integration harness                         | Plan approval                                       | Owns merges and cross-module E2E                                                       |
| Agent 1: Shopify/ingress | Synthetic ingress adapter, webhook receipt, normalization; optional dev-store adapter behind same port | Ingress/event contracts + base schema               | Before qualification E2E                                                               |
| Agent 2: Qualification   | Rule schema evaluator, evaluation audit, assignment creation                                           | Commerce event + moment/assignment schemas          | Before live queue E2E                                                                  |
| Agent 3: Researcher UI   | Queue, atomic claim UI, script runner, fake completion views                                           | Assignment/interview service contracts + auth shell | Before browser E2E                                                                     |
| Agent 4: Providers       | Telephony/transcription ports, deterministic fakes, lifecycle callback simulation                      | Provider ports + call/transcript schemas            | Before fake completion E2E                                                             |
| Agent 5: Evidence        | Transcript/tag/evidence services and minimal tagging view                                              | Interview completion + tag contracts                | Before Angle creation                                                                  |
| Agent 6: Reports         | Minimal Angle editor/service and HTML report renderer                                                  | Evidence query + metric/render contracts            | Final functional link                                                                  |
| Agent 7: Security        | Threat-model review of shared design; HMAC/PII/authz test requirements                                 | Gate 0 draft                                        | Reviews each integration, does not block initial parallel coding absent a launch issue |
| Agent 8: QA              | Canonical synthetic dataset, E2E orchestration, retry/duplicate tests                                  | Shared testkit and route contracts                  | Runs continuously; acceptance owner                                                    |

### Safe parallel waves

1. **Foundation (serial integration):** Agent 0 creates Gate 0. Agent 7 reviews privacy/security contracts; Agent 8 reviews testability.
2. **Core parallel wave:** Agents 1, 2, 4, and 5 implement against frozen shared contracts. Agent 2 initially consumes seeded CommerceEvents; Agent 5 consumes seeded completed interviews, so work does not block on upstream UI.
3. **Experience/output parallel wave:** Agent 3 consumes seeded assignments while Agent 6 consumes seeded evidence. Agent 8 assembles the E2E fixture and tests.
4. **Integration wave:** Agent 0 merges in dependency order: schema/contracts -> ingress -> qualification -> provider/interview -> evidence -> reporting -> UI/E2E. Agent 7 reviews the integrated flow.

### Agent dependencies after Milestone 1

- Agent 1 can harden Shopify integration in parallel with Agent 2's configuration/allocation once event contracts are frozen.
- Agent 3 and Agent 4 proceed together after assignment/interview transitions freeze.
- Agent 5 depends on transcript lifecycle but can build manual transcript/tag flows before the real provider.
- Agent 6 depends on stable evidence queries and metric semantics, not on a real telephony vendor.
- Agent 7 reviews continuously and owns the final launch-blocker assessment.
- Agent 8 owns deterministic demo health across all milestones and should not invent separate domain fixtures.

## Five highest technical risks / unresolved decisions

1. **Outbound contact, consent, and recording legality.** Jurisdiction, merchant relationship, TCPA/state rules, caller identity, and consent requirements may materially change contactability and recording flows. Legal/product decisions are mandatory before live calls.
2. **Protected customer data and tenant isolation.** Phone access is essential but high impact. Shopify approval, data minimization, encryption/key operations, researcher masking, export controls, deletion, and cross-tenant tests are launch-critical.
3. **Attribution semantics and Shopify data quality.** Shopify-observed attribution may be missing, inconsistent, or demand-capture-biased. A versioned normalization taxonomy and honest unknowns are needed; comparisons must never imply causal truth.
4. **At-least-once workflow correctness.** Duplicate/out-of-order webhooks, job retries, concurrent claims, callback replays, and partial provider failures can create duplicate assignments or contradictory state without strong constraints and replay tests.
5. **Evidence/report statistical integrity.** Small, allocated interview samples can be mistaken for population estimates. Metrics need explicit population, denominator, cohort, period, computation version, caveats, and immutable evidence provenance.

Secondary unresolved choices—hosting, job library, identity provider, telephony/transcription vendor, and PDF engine—are deliberately behind ports and must be decided by their gate without changing the domain model.

## Exact next implementation task

Create one reviewable **Foundation PR** that performs Gate 0 and nothing broader:

1. scaffold the TypeScript workspace with Shopify's official React Router foundation in `apps/web`, `apps/worker`, and the package boundaries from `docs/architecture.md`;
2. add strict build/lint/test/CI and typed environment validation;
3. configure local PostgreSQL, Drizzle, and the migration/test harness;
4. implement the shared runtime schemas/state types/provider ports listed above;
5. migrate the minimum tenant, commerce-event, versioning, assignment, evidence, and outbox foundations needed by Milestone 1;
6. add the deterministic synthetic testkit plus one contract test proving a duplicate synthetic order maps to one `CommerceEvent` identity.

Do not build the UI, Shopify OAuth, a real provider adapter, or report styling in this PR. Its acceptance is that every specialist can branch from it without redefining shared types or infrastructure.
