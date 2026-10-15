# Holler product source of truth

## Authority

The product owner's verbatim **Holler Working Backwards Document (WBD)** is
preserved in [`working-backwards-document.md`](working-backwards-document.md)
and is the primary source of truth for product intent, customer promise,
positioning, workflow, packaging, and MVP prioritization. This file is its
normalized implementation interpretation and decision ledger. If another
repository document conflicts, follow the WBD together with the explicit
product-owner resolutions recorded here; those resolutions control where the
verbatim WBD contradicts itself.

Implementation facts in the codebase and security, privacy, legal, or provider
constraints may describe how or whether that intent is currently implemented;
they do not redefine the product. Unsupported customer quotes and outcome
claims in the WBD are aspirations until validated and must not be presented as
actual case studies.

## Product promise and customer

Holler provides high-quality first-party customer research to DTC ecommerce
brands without requiring them to build an internal research function. The
initial target is brands with approximately **$10M-$150M in revenue**, and the
primary buyer is a CMO or senior marketing leader. Product teams are an
important secondary audience.

The core problems are weak information about why customers buy, unreliable
marketing attribution, stale personas and positioning, and insufficient
product feedback. The intended outcome is better marketing and product
decisions, not an attribution platform, media-buying tool, or implementation
consultancy.

## Research model

A **Research Angle** is a question or hypothesis paired with a defined customer
segment and prioritized interview questions. Examples include customers
attributed to Google, repeat buyers entering a new product category, or buyers
whose AOV changed between purchases. Qualification rules decide who is eligible
for outreach.

The current code and schema use `ResearchMoment` for the executable, versioned
configuration that implements a Research Angle. Treat `ResearchMoment` as an
internal implementation name, not a competing product concept. In customer
language and new documentation, prefer **Research Angle**.

The first production trigger is an order completing in Shopify. Shopify
webhooks should make the customer eligible for outreach immediately after
checkout. Holler's differentiator is point-in-time research: the target is to
initiate outreach within **60 seconds** when qualification, consent/contact
policy, and staffing allow.

The intended post-pilot customer journey begins with a text asking whether the
customer is open to a short feedback call, followed by a human-to-human
interview. The first pilot uses individually initiated direct calls with no SMS.

Interviews prioritize breadth while allowing useful conversations to run long.
The expected median is roughly five to seven minutes. A completed interview
must answer at least one substantive Angle question; demographic or greeting
content alone does not count. Researchers listen, follow the customer's lead,
and optimize first for leaving the customer with a more positive perception of
the brand. Customers are not paid for participating.

Humans conduct interviews. AI may assist researchers and analysis, but an AI
interviewer is outside the initial product. Holler delivers insights and
recommendations but does not implement those recommendations in the MVP.

## Deliverables

Customer deliverables use plain report language; **Earshot** and **Disco** are
not WBD terms and are retired from the product specification.

- A $1,000 starting monthly subscription includes 25 completed interviews and
  two hours of consented audio recordings each month.
- A monthly subscriber report contains an executive summary, visualizations
  from tagged conversations, key learnings and anecdotes, recommended tactical
  actions and marketing experiments, and raw notes plus links to authorized
  recordings/transcripts.
- Monthly subscribers also receive a quarterly long-form research report that
  combines and deepens the learning from the period. There is no distinct
  quarterly subscription.
- A standalone Research Run investigates one or more specific Research Angles
  and ends with a report using the same evidence-backed structure.
- Reports must distinguish observed commerce attribution from what customers
  self-report and must make sample size and limitations clear.

Customers receive transcripts and transcript links as supporting evidence. The
WBD statement that Holler "doesn't provide transcripts" means Holler does not
sell transcript dumps _instead of insights_. Access remains private and subject
to consent, authorization, retention, and deletion policy.

## Sales and onboarding

The early sales motion is a free three-to-seven-day research engagement:

1. Day 1: the company installs the Shopify app; Holler receives permitted data
   and analyzes customer behavior, segments, and observed attribution.
2. Day 2: Holler meets the marketing leader, reviews hypotheses, proposes
   Research Angles, and begins interviews.
3. Day 3: Holler shares initial conversations, notes/transcripts, and tags and
   checks whether the material is useful.
4. Day 7: Holler delivers the initial Research Angle report and discusses a
   subscription or standalone engagement.
5. Around Day 30: a continuing customer receives the first full monthly report,
   followed by a review within two to three days.

The long-term intention is to remove the free trial after Holler has credible
references and proof.

## Packaging and economics

- Monthly subscriptions start at **$1,000**.
- Standalone Research Runs start at **$3,500** and include at least 50 completed
  interviews and three hours of consented audio recordings.
- Larger runs should have a lower price per completed interview.
- Internal planning cost is approximately `$360 + $8 per completed interview`;
  this is an operating assumption, not customer-facing pricing.
- Pricing and packaging are hypotheses to revisit after early engagements.

## MVP priorities

The MVP must support the shortest safe path from a Shopify order to useful
human research:

1. Shopify install, minimum necessary historical context, and verified,
   idempotent `orders/create` ingestion.
2. Versioned Research Angle configuration: segment rules, questions, priority,
   feasibility/volume forecast, and target completed interviews.
3. Deterministic qualification into a research queue with suppression,
   cooldown, and auditability.
4. Compliant outreach, an explicitly human-controlled call, and researcher UX
   that keeps the conversation ahead of form completion.
5. Recording, notes, transcripts, tags, and evidence handling as allowed by
   consent and retention policy.
6. Evidence-backed monthly, quarterly, and standalone reports. Manual report
   assembly is acceptable for the first pilot.

Benchmarking across companies is a future product. Automated media buying,
full self-service BI, AI interviewers, recommendation implementation, and a
general-purpose rules or experimentation platform are outside the MVP.

## Resolved WBD ambiguities

The product owner resolved the WBD's internally inconsistent wording on
2026-10-15:

1. The starting $1,000 monthly subscription includes 25 completed interviews
   and two hours of consented audio recordings per month.
2. There is no separate quarterly subscription. Monthly subscribers receive a
   quarterly long-form report in addition to monthly reports.
3. The first pilot uses direct calling with no SMS. The text-invitation flow is
   a post-pilot target and still requires its own legal and operational approval.
4. Customers receive transcripts and links as supporting evidence alongside
   Holler's synthesis and recommendations.
5. "Recorded research hours" means consented audio recordings, not total
   unrecorded interview time.

These decisions govern when the verbatim WBD contains conflicting statements.
