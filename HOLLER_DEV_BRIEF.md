# Holler - Product & Engineering Brief

## 1. Company Thesis

Holler gives businesses access to high-quality, point-in-time customer research tied directly to real customer events.

The initial vertical is ecommerce.

The core insight is that customer memory is freshest immediately around economically important events - especially purchase, repeat purchase, and delivery. Instead of relying only on clickstream attribution, surveys, or retrospective interviews, Holler reaches customers at the moment the underlying decision is still top of mind.

Holler combines:

1. **Observed behavior** - Shopify/order/customer data.
2. **Stated behavior** - structured human interviews.
3. **Structured synthesis** - segmented findings, research tags, and quantified patterns.
4. **Raw evidence** - recordings and transcripts.

The initial customer value proposition has two primary pillars:

### A. Attribution Audit
Improve marketing spend quality and ROAS by identifying discrepancies between platform/Shopify attribution and what customers say actually influenced their purchase.

Examples:
- "38% of customers attributed to Meta said they first discovered the brand through a creator."
- "Brand search appears to be capturing demand rather than creating it."
- "Repeat customers tagged to retargeting said they already intended to repurchase."

### B. Marketing Feedback
Improve creative, copy, positioning, and messaging through direct customer language.

Examples:
- "Customers buying SKU X most often cited portability, not price, as the primary reason for purchase."
- "Repeat purchasers most frequently said reminder emails triggered their return."
- "Customers described the product using language not currently present in paid creative."

Secondary benefits:

### C. Product Feedback
- Reasons for choosing a SKU
- Product expectations
- Objections
- Returns / disappointment
- Desired products and features

### D. Brand Affinity
Holler researchers act on behalf of the brand. Customers receive personal communication at meaningful moments, creating a sense that the brand notices and cares about them.

---

## 2. Product Model

The unit of work is a **Research Moment**.

A Research Moment is:

> A specific customer event + eligibility criteria + research objective + interview script + structured tags.

Examples:

### Checkout Moment
Trigger:
- Order completed

Possible research goals:
- True discovery source
- Purchase trigger
- Considered alternatives
- Objections
- Why this SKU
- Creative/message recall

### Repeat Purchase Moment
Trigger:
- Customer places order #2+

Possible research goals:
- Why they returned
- What reminded them
- Whether email/SMS/retargeting influenced the purchase
- Whether they intended to buy anyway
- Product satisfaction

### Delivery Moment
Trigger:
- Fulfillment delivered

Possible research goals:
- First impression
- Expectation vs reality
- Product experience
- Packaging
- Satisfaction
- Purchase confidence

Future moments may include:
- Return initiated
- Refund
- Subscription start/cancel
- Long lapse / no repeat purchase
- High-value purchase
- Cart abandonment
- Specific campaign / SKU / customer cohort

---

## 3. Core Customer Workflow

### Merchant Setup

1. Merchant installs Holler Shopify app.
2. Merchant authorizes required Shopify scopes.
3. Holler imports relevant historical order/customer/product data.
4. Merchant defines:
   - research objectives
   - preferred cohorts
   - weekly interview volume
   - brand voice / call introduction
   - configurable research tags
5. Holler activates Research Moments.

### Ongoing Workflow

1. Shopify event occurs.
2. Holler receives event in near real time.
3. Customer/event enters qualification engine.
4. Qualification engine determines:
   - whether customer belongs to an active research cohort
   - priority
   - which script to use
   - which research tags matter
5. Eligible research moment enters interview queue.
6. Human researcher contacts customer.
7. Researcher follows approved script.
8. Interview is recorded/transcribed subject to applicable consent requirements.
9. Interview receives structured metadata and tags.
10. Raw evidence is retained according to customer/company policy.
11. Findings accumulate throughout the month.
12. Holler generates monthly Angles Report.
13. Customer receives:
   - one-page executive summary
   - detailed segmented findings
   - source interview recordings
   - transcripts
   - structured raw research data

There is no need for a real-time "insights inbox" in the MVP.

---

## 4. Angles Report

The Angles Report is the primary deliverable.

It should be designed for a marketing/growth team and answer:

> What changed?
> Why?
> What did customers actually say?
> What should the team test or change?

### Report Structure

#### Page 1 - Executive One Pager

Include:
- 3-5 most important findings
- material attribution discrepancies
- most important customer-language / messaging themes
- cohort or behavioral changes worth attention
- suggested tests/actions
- sample size / confidence caveats

Example:

**Meta appears over-attributed for first purchases**
- Shopify attributed 47% of sampled first-time purchases to Meta.
- Only 19% of interviewed customers described Meta as their original discovery source.
- 31% cited creators.
- 18% cited word of mouth.

**Repeat purchase rate increased**
- Repeat purchase share rose 6.2 percentage points month over month.
- 43% of interviewed repeat buyers said email reminded them to repurchase.
- Only 12% described paid retargeting as material.

**SKU X positioning opportunity**
- 58% of first-time SKU X buyers mentioned convenience/portability.
- Current product page emphasizes durability and price.
- Recommended test: shift paid creative toward convenience use cases.

#### Detailed Angles

An Angle is a synthesized research finding tied to:
- cohort
- research question
- tags
- customer quotes
- supporting interviews
- quantitative share/count
- comparison against observed data where relevant

Possible angle categories:

**Attribution**
- First discovery source
- Purchase trigger
- Demand creation vs demand capture
- Ad recall
- Email influence
- Retargeting influence
- Creator influence
- Word of mouth

**Marketing**
- Language customers use
- Main benefit sought
- Objection
- Purchase justification
- Competitor considered
- Creative remembered
- Message that resonated

**Retention**
- Why customer returned
- Reminder / trigger
- Product satisfaction
- Replenishment intent
- Discount dependence

**Product**
- Why SKU selected
- Expected use case
- Desired feature
- Expectation mismatch
- Packaging / delivery feedback

### Raw Evidence

Every Angle should be traceable to:
- interview IDs
- transcript excerpts
- recording
- event/order/customer cohort
- tags

Avoid presenting qualitative samples as statistically representative when they are not.

---

## 5. Research Tags

Research tags are structured fields extracted from or assigned to interviews.

There should be:

### Platform Tags
Defined by Holler and shared across customers.

Examples:
- discovery_source
- purchase_trigger
- primary_motivation
- objection
- competitor_considered
- ad_recall
- creator_influence
- word_of_mouth
- email_influence
- sms_influence
- repeat_purchase_trigger
- sku_reason
- discount_dependency
- expected_use_case
- satisfaction
- product_issue

### Customer-Defined Tags
Each merchant can define a limited number of additional research dimensions.

Example:
- bought_for_golf
- bought_as_gift
- sensitive_skin
- wedding_purchase

Requirements:
- tags should be versioned
- tag definitions should be explicit
- scripts may reference tag objectives
- reports should preserve tag version used at interview time

AI may assist with suggested tagging later, but tags must always remain auditable against the transcript.

---

## 6. Trend-Driven Research Allocation

Holler should not simply interview a random fixed sample forever.

A merchant purchases a weekly interview volume.

Example:
- 25 interviews/week
- 100 interviews/month

Holler allocates that capacity dynamically.

Inputs may include:
- repeat purchaser % changed materially
- new customer % changed
- SKU mix changed
- AOV changed
- specific SKU grew/shrank
- attribution mix changed
- customer cohort behavior changed
- merchant manually prioritizes a question

Example:

Month 1:
- 40% attribution audit
- 30% first-purchase motivation
- 30% repeat purchase

Month 2:
Repeat purchase rate jumps.

Allocation becomes:
- 20% attribution audit
- 20% first-purchase motivation
- 60% repeat-purchase investigation

MVP may use human-created allocation rules.
Do not overbuild anomaly detection initially.

---

## 7. MVP Scope

### Must Have

#### Shopify
- Shopify app install/auth
- Shopify webhook verification
- orders/create ingestion
- customer/order/product normalization
- fulfillment/delivery event support if available/reliable through Shopify data
- historical import sufficient for customer/order context

#### Event System
- event table
- Research Moment definitions
- qualification rules
- cohort assignment
- idempotency
- retries
- event audit trail

#### Research Operations
- live interview queue
- customer context screen
- approved scripts
- script versioning
- researcher workflow
- interview status
- attempted / reached / completed / declined
- notes
- tags
- recording/transcript references
- research objective shown prominently

#### Reporting Data Model
- interviews
- transcript segments
- tags
- angles
- cohorts
- observed attribution fields
- self-reported attribution fields

#### Angles Report
For MVP, report generation may be partially manual.

System should provide:
- exportable interview dataset
- angle builder / structured findings editor
- one-page summary data
- links from findings back to evidence
- PDF/HTML-friendly report output

### Explicitly Out of Scope for Initial MVP

- MMM
- full Triple Whale-style executive dashboard
- automated media buying
- automated ad optimization
- large-scale experimentation platform
- AI interviewer replacing humans
- complex ML anomaly detection
- customer "insights inbox"
- native mobile app
- broad non-Shopify integrations
- fully autonomous report generation

---

## 8. Initial Technical Architecture

Recommended high-level architecture:

```text
Shopify
   |
   | Webhooks + Admin GraphQL API
   v
Webhook/API Service
   |
   v
Event Store / Queue
   |
   +--> Normalized Commerce DB
   |
   v
Qualification Engine
   |
   v
Research Queue
   |
   v
Researcher Application
   |
   +--> Telephony provider
   +--> Recording / transcription
   |
   v
Interview + Research Data
   |
   v
Angle Builder
   |
   v
Monthly Angles Report
```

### Suggested Stack

Use the existing stack if the repository already has one.

Otherwise default to:
- TypeScript
- Next.js
- Shopify embedded app framework
- PostgreSQL
- Prisma or Drizzle
- background-job system appropriate to deployment
- object storage for audio where needed
- telephony abstraction layer
- transcription abstraction layer
- server-side report generation

Do not prematurely couple the system to a single telephony or transcription vendor.

---

## 9. Data Model - First Pass

### Merchant
- id
- shopify_shop_id
- shop_domain
- name
- timezone
- weekly_interview_target
- status

### Customer
- id
- merchant_id
- shopify_customer_id
- created_at
- order_count
- lifetime_revenue
- first_order_at
- latest_order_at

Do not store unnecessary PII in this table.

### CustomerPrivate
- customer_id
- encrypted_name
- encrypted_phone
- encrypted_email if required
- expires_at

### Order
- id
- merchant_id
- customer_id
- shopify_order_id
- created_at
- total
- currency
- first_order_boolean
- observed_attribution_json
- fulfillment_status

### OrderLineItem
- order_id
- product_id
- variant_id
- sku
- quantity
- price

### CommerceEvent
- id
- merchant_id
- customer_id
- order_id
- event_type
- occurred_at
- payload_reference
- processing_status
- idempotency_key

### ResearchMoment
- id
- merchant_id
- name
- event_type
- active
- priority
- eligibility_rules_json
- script_version_id
- target_tags_json

### ResearchAssignment
- id
- research_moment_id
- event_id
- customer_id
- order_id
- priority
- status
- assigned_researcher_id
- created_at
- expires_at

### Script
- id
- merchant_id nullable
- name

### ScriptVersion
- id
- script_id
- version
- content_json
- active_from
- active_to

### Interview
- id
- merchant_id
- research_assignment_id
- researcher_id
- started_at
- completed_at
- outcome
- recording_uri
- transcript_status
- script_version_id

### TranscriptSegment
- id
- interview_id
- speaker
- started_at
- ended_at
- text

### TagDefinition
- id
- merchant_id nullable
- key
- description
- version
- type

### InterviewTag
- interview_id
- tag_definition_id
- value
- confidence
- evidence_segment_ids

### Angle
- id
- merchant_id
- reporting_period
- title
- summary
- cohort_definition
- metric_name
- metric_value
- evidence_json
- recommended_action
- status

### Report
- id
- merchant_id
- reporting_period
- status
- generated_at
- artifact_uri

---

## 10. Security and Privacy Requirements

This system is expected to process Shopify protected customer data.

From the beginning:

- use synthetic data in development
- separate dev/test/prod data
- never commit production credentials
- never put customer PII in source control
- never include PII in AI coding prompts
- never include PII in application logs
- never include raw request bodies in error monitoring
- verify Shopify webhook HMAC
- enforce webhook idempotency
- encrypt data in transit
- encrypt sensitive customer data at rest
- separate PII from analytics/research data where practical
- use role-based access
- log access to protected data
- support retention/deletion
- minimize stored PII
- design researchers so raw phone number does not need to be displayed
- document consent/recording requirements per jurisdiction before production launch

The development system must be fully functional with synthetic phone numbers and synthetic customer records.

---

## 11. Product Principles

1. **Point in time matters**
   Research should occur as close as practical to the customer event.

2. **Human research first**
   Humans conduct the interviews in the initial product.

3. **Evidence must be inspectable**
   Every conclusion should link back to transcripts/recordings.

4. **Do not overclaim**
   Qualitative research provides evidence and direction, not perfect statistical truth.

5. **Observed + stated**
   The value comes from comparing observed commerce/attribution data with customer explanation.

6. **Reports over dashboards**
   The initial deliverable is a monthly decision document, not another analytics dashboard.

7. **Marketing team is the primary buyer**
   Attribution and messaging are the first two jobs to be done.

8. **Product feedback and brand affinity are valuable secondary outputs**
   Do not let secondary value propositions dilute the initial pitch.

9. **Customization without bespoke chaos**
   Allow customer-specific tags/questions within a controlled platform framework.

10. **Start narrow**
   Shopify first. Ecommerce first. Purchase/repeat/delivery moments first.

---

## 12. Definition of MVP Success

The MVP succeeds if a Shopify merchant can:

1. Install Holler.
2. Stream new orders into Holler.
3. Define an active Research Moment.
4. Automatically qualify relevant customers.
5. Put them into a live researcher queue.
6. Complete and record a structured interview.
7. Store a transcript and structured tags.
8. Compare self-reported attribution against observed attribution.
9. Assemble multiple interviews into a documented Angle.
10. Generate a monthly Angles Report whose findings link back to source evidence.

Anything beyond this should require a strong reason.

---

## 13. Open Product Decisions / Assumptions

These do not block development. Treat the defaults below as current assumptions until changed.

### Telephony
Assumption:
- use a provider abstraction
- researcher initiates outbound call from Holler
- customer phone number can remain masked from researcher
- recording can be enabled/disabled based on merchant/jurisdiction policy

### Call Timing
Assumption:
- checkout-triggered calls target a short SLA such as <5 minutes
- not every qualifying event must be called
- the cohort/weekly interview allocation determines sampling

### Customer Consent
Assumption:
- production rollout requires legal review of outbound calling, brand representation, recording consent, TCPA/state laws, and merchant privacy terms
- development uses synthetic customers only

### Surprise & Delight
Assumption:
- useful but not a hard dependency for MVP
- first version may support a manual reward note/status rather than automated shipping upgrades

### Delivery Trigger
Assumption:
- implement once a reliable delivery/fulfillment event source is confirmed
- purchase is the first production Research Moment

### Attribution
Assumption:
- preserve raw Shopify attribution/referrer/UTM fields where available
- model "observed attribution" flexibly because external sources such as Meta/Google may be integrated later
- self-reported attribution must be stored separately and never overwrite observed attribution

### Reporting
Assumption:
- monthly report is the primary client-facing output
- internal software may contain operational dashboards
- client does not need a constant insight feed in MVP

---

## 14. Engineering Working Rules

- Prefer boring, auditable architecture.
- Every webhook handler must be idempotent.
- Every state transition should be recoverable.
- External providers should sit behind interfaces.
- Keep research logic separate from telephony logic.
- Keep reporting logic separate from raw evidence.
- Preserve raw data before derived interpretations.
- Version scripts and tag definitions.
- Never destroy historical interpretation context when a script/tag definition changes.
- Build the data model so new Research Moments can be added without schema rewrites.
- Write tests around event qualification and research assignment creation.
- Do not create sophisticated abstractions until at least two concrete use cases require them.
