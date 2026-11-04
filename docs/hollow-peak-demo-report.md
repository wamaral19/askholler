# Hollow Peak Interactive Research Workspace

Report type: Research workspace
Research angle: Repeat purchase, attribution, and category expansion
Period: 2026-08-01 through 2026-10-31
Merchant timezone: America/Denver
Workspace version: `holler-research-workspace-v2`
Dataset seed: `hollow-peak-repeat-purchase-v2`

## Synthetic-data disclosure

Hollow Peak is a fictional outdoor-apparel merchant. Every customer, order,
product, quote, recording, transcript, tag application, metric, and conclusion
in this workspace is synthetic. The product interaction model is intended to
represent production behavior.

## Delivery model

The canonical deliverable is a private interactive workspace reached through
an opaque, revocable share link. The invitation is sent by email. Merchant
login is not required in the first release.

PDF is an optional snapshot/export. It is not the default delivery mechanism
and is not the canonical evidence surface.

## Canonical population

- 10,000 orders over three months.
- Monthly order distribution: 3,210 / 3,348 / 3,442.
- 50 completed repeat-buyer conversations.
- 4 hours 48 minutes of consented recorded research.
- 362 accepted tag applications.
- Featured product: Ridge Pant.

## Conversation overview

The workspace begins with the four population metrics, without an introductory
story paragraph. The visualization is headed **The Core**, followed by the line
**Click to see the raw data that powers the report** and an **Open brand
dashboard** link. It then plots all 50 interviews as individual bubbles arranged
into one circular cluster. Bubble size represents recording duration.

Hover and keyboard focus reveal the conversation's accepted-tag count, item
count, order value, and purchase sequence. A brand-dashboard link appears below
the explanatory copy; it may remain nonfunctional in the sample.

Every conversation is a repeat purchase. No bubble, tooltip, or conversation
row may show purchase sequence `#1`.

The insight section uses **Actionable Insights** as its only heading and moves
directly into the findings. It does not include an explanatory deck or a second
section title.

## Actionable insights

### 1. Test free shipping at a lower threshold

Six customers said shipping cost made them pause. Two added an item to qualify
for free shipping. Test whether a lower threshold improves checkout conversion
enough to offset the AOV and margin tradeoff.

Tags: `AOV`, `Shipping costs`, `Checkout conversion`.

### 2. Target loyal Ridge Pant customers with an adjacent-category offer

Repeat purchasers frequently buy the same pant in another color without adding
a new category. Eight love the Ridge Pant but remain loyal to a competitor for
outerwear. This is a precise audience for a product-specific offer.

Tags: `Repeat purchasers`, `Competitor`, `Product feedback`.

### 3. Double down on the brand campaign about rugged use

John, James, and Jeff each described the Ridgeline campaign's rugged-use
message as a reason Hollow Peak felt more credible than competitors. Only
John's repeat purchase was attributed to Meta. James and Jeff returned through
direct and Google, suggesting the campaign created demand beyond last-click
credit.

Recommended test: test the rugged-use message independently of retargeting and
branded search.

Tags: `Brand`, `Ad attribution`, `Meta`.

## Interesting patterns

- Meta receives more credit than customers can explain: 14 attributed, 4 able
  to recall a path. Tags: `Ad attribution`, `Meta`.
- Most Google conversions begin with existing intent: 11 attributed, 7 already
  searching specifically for Hollow Peak. Tags: `Ad attribution`, `Google`,
  `Brand`.
- Three customers independently named the same competitor as their preferred
  outerwear brand. Tags: `Competitor`, `Product feedback`.
- Six customers said they delayed a repeat purchase until a promo code arrived.
  Tags: `Promotions`, `Repeat purchasers`.

## Customer nuggets

- Carl has referred several friends and knows at least three who purchased.
  Tags: `Referral`, `Brand`.
- Kyle dislikes the pockets on Hollow Peak jackets, so he will not branch out
  from pants. Tags: `Product feedback`, `Competitor`.
- Eric moved to Hollow Peak after deciding that a competitor's quality had
  deteriorated. Tags: `Competitor`, `Brand`.
- After losing weight, Patrick needed a new wardrobe and became willing to
  explore new brands. Tags: `Sizing / fit`, `Life event`, `Brand`.

## Interaction contract

### Clickable tags

Selecting a finding, pattern, or nugget tag filters the conversation index
directly. The inline tag explorer is part of the page rather than a separate
sidebar. Tags are ordered by the number of current accepted applications in the
workspace, highest first.

### Conversation index

Every conversation row contains:

- a completed-call link and synthetic customer display name;
- item count and order value;
- recording length;
- accepted tags;
- an expander for product, purchase-sequence, and attribution detail.

Rows do not display a quote. Named customers in an insight, including John,
James, and Jeff, link to their matching row. The completed-call route follows
`https://app.withholler.com/calls/:interviewId`.

Filtering by a tag returns only conversations with a current accepted
application of that tag. Rejected and superseded applications do not appear.

### Share behavior

- Share grants are scoped to one immutable workspace revision.
- Tokens are random, unguessable, stored only as hashes, revocable, and
  auditable.
- Evidence routes authorize the request before returning transcript text or
  issuing short-lived media access.
- Direct customer identifiers and permanent storage URLs never appear.

## Current sample route

The implemented public sample is `/sample-report` in the Holler web app. Its
primary source files are:

- `apps/web/app/routes/shopify-app-sample-report.tsx`
- `apps/web/app/styles.css`

## Prospect-specific demos

Prospect demos reuse this workspace component and interaction contract while
replacing merchant, product, category, competitor, channel, count, quote, and
tag fixtures from a deterministic synthetic configuration. Prospect generation
must not mutate the permanent Hollow Peak seed.

## Method and limitations

The interview sample and commerce population use separate denominators. Tags
represent reviewed evidence applications, not causal proof. Individual nuggets
remain anecdotes until additional evidence accumulates. All percentages must
identify their numerator, denominator, population, cohort, and period.
