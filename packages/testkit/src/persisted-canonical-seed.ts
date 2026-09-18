import * as schema from "@holler/db";
import { canonicalIds } from "./canonical-synthetic-flow";
import type { TestDatabase } from "./postgres-test-database";

const ids = {
  categoryTops: "00000000-0000-7000-8000-000000000201",
  categorySkincare: "00000000-0000-7000-8000-000000000202",
  categorySocks: "00000000-0000-7000-8000-000000000203",
  harborTee: "00000000-0000-7000-8000-000000000211",
  cloudDew: "00000000-0000-7000-8000-000000000221",
  trailSocks: "00000000-0000-7000-8000-000000000231",
  firstOrder: "00000000-0000-7000-8000-000000000301",
  firstLine: "00000000-0000-7000-8000-000000000311",
  secondLine: "00000000-0000-7000-8000-000000000312",
  receipt: "00000000-0000-7000-8000-000000000401",
  script: "00000000-0000-7000-8000-000000000501",
  fieldSet: "00000000-0000-7000-8000-000000000510",
  moment: "00000000-0000-7000-8000-000000000511",
  evaluation: "00000000-0000-7000-8000-000000000521",
  call: "00000000-0000-7000-8000-000000000532",
  angleEvidenceCreator: "00000000-0000-7000-8000-000000000721",
  angleEvidenceEmail: "00000000-0000-7000-8000-000000000722",
  metricObserved: "00000000-0000-7000-8000-000000000731",
  metricReported: "00000000-0000-7000-8000-000000000732",
  reportArtifact: "00000000-0000-7000-8000-000000000713",
  phoneRevealAudit: "00000000-0000-7000-8000-000000000751",
} as const;

const fieldVersions = [
  canonicalIds.discoveryField,
  canonicalIds.triggerField,
  canonicalIds.influenceField,
  "00000000-0000-7000-8000-000000000544",
  canonicalIds.liquidityField,
  canonicalIds.absorptionField,
  "00000000-0000-7000-8000-000000000547",
  "00000000-0000-7000-8000-000000000548",
] as const;

const segment = (sequence: number) =>
  `00000000-0000-7000-8000-${String(560 + sequence).padStart(12, "0")}`;

const at = (value: string) => new Date(value);
const periodStart = at("2026-09-01T04:00:00.000Z");
const periodEnd = at("2026-10-01T04:00:00.000Z");

export interface PersistedCanonicalSeedResult {
  readonly merchantId: string;
  readonly commerceEventId: string;
  readonly assignmentId: string;
  readonly interviewId: string;
  readonly reportId: string;
}

/** Idempotently persists the canonical synthetic scenario for one tenant. */
export async function seedPersistedCanonicalFlow(
  db: TestDatabase,
): Promise<PersistedCanonicalSeedResult> {
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.merchants)
      .values({
        id: canonicalIds.merchant,
        shopifyShopId: "gid://shopify/Shop/900000000001",
        shopDomain: "juniper-row-synthetic.myshopify.com",
        name: "Juniper Row",
        timezone: "America/New_York",
        weeklyInterviewTarget: 10,
        status: "active",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.customers)
      .values({
        id: canonicalIds.customer,
        merchantId: canonicalIds.merchant,
        shopifyCustomerId: "gid://shopify/Customer/900000000101",
        orderCount: 2,
        lifetimeRevenueMinor: 11200,
        currency: "USD",
        firstOrderAt: at("2026-08-14T16:30:00.000Z"),
        latestOrderAt: at("2026-09-17T14:00:00.000Z"),
        historyCompleteness: { state: "complete", reason: "full_import" },
        contactabilityStatus: "eligible",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.customerPrivate)
      .values({
        customerId: canonicalIds.customer,
        merchantId: canonicalIds.merchant,
        encryptedGivenName: "synthetic:v1:encrypted-given-name",
        encryptedPhoneE164: "synthetic:v1:encrypted-phone",
        keyVersion: "synthetic-v1",
      })
      .onConflictDoNothing();

    await tx
      .insert(schema.productCategories)
      .values([
        {
          id: ids.categoryTops,
          merchantId: canonicalIds.merchant,
          source: "merchant",
          key: "tops",
          label: "Tops",
        },
        {
          id: ids.categorySkincare,
          merchantId: canonicalIds.merchant,
          source: "merchant",
          key: "skincare",
          label: "Skincare",
        },
        {
          id: ids.categorySocks,
          merchantId: canonicalIds.merchant,
          source: "merchant",
          key: "socks",
          label: "Socks",
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(schema.products)
      .values([
        {
          id: ids.harborTee,
          merchantId: canonicalIds.merchant,
          shopifyProductId: "gid://shopify/Product/900000000211",
          title: "Harbor Tee",
          catalogEnrichmentState: "ready",
        },
        {
          id: ids.cloudDew,
          merchantId: canonicalIds.merchant,
          shopifyProductId: "gid://shopify/Product/900000000221",
          title: "Cloud Dew Moisturizer",
          catalogEnrichmentState: "ready",
        },
        {
          id: ids.trailSocks,
          merchantId: canonicalIds.merchant,
          shopifyProductId: "gid://shopify/Product/900000000231",
          title: "Trail Crew Socks",
          catalogEnrichmentState: "ready",
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(schema.productCategoryAssignments)
      .values([
        {
          merchantId: canonicalIds.merchant,
          productId: ids.harborTee,
          categoryId: ids.categoryTops,
        },
        {
          merchantId: canonicalIds.merchant,
          productId: ids.cloudDew,
          categoryId: ids.categorySkincare,
        },
        {
          merchantId: canonicalIds.merchant,
          productId: ids.trailSocks,
          categoryId: ids.categorySocks,
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(schema.orders)
      .values([
        {
          id: ids.firstOrder,
          merchantId: canonicalIds.merchant,
          customerId: canonicalIds.customer,
          shopifyOrderId: "gid://shopify/Order/900000000301",
          orderedAt: at("2026-08-14T16:30:00.000Z"),
          sourceUpdatedAt: at("2026-08-14T16:30:00.000Z"),
          totalMinor: 4800,
          currency: "USD",
          customerOrderSequence: 1,
          observedAttribution: { source: "direct" },
        },
        {
          id: canonicalIds.order,
          merchantId: canonicalIds.merchant,
          customerId: canonicalIds.customer,
          shopifyOrderId: "gid://shopify/Order/900000000302",
          orderedAt: at("2026-09-17T14:00:00.000Z"),
          sourceUpdatedAt: at("2026-09-17T14:00:00.000Z"),
          totalMinor: 6400,
          currency: "USD",
          customerOrderSequence: 2,
          observedAttribution: {
            source: "meta",
            channel: "paid_social",
            campaign: "cloud-dew-retargeting",
          },
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(schema.orderLineItems)
      .values([
        {
          id: ids.firstLine,
          merchantId: canonicalIds.merchant,
          orderId: ids.firstOrder,
          shopifyLineItemId: "gid://shopify/LineItem/900000000311",
          productId: ids.harborTee,
          shopifyVariantId: "gid://shopify/ProductVariant/900000000212",
          sku: "JR-TEE-NV-M",
          title: "Harbor Tee / navy / M",
          quantity: 1,
          unitPriceMinor: 4800,
          currency: "USD",
        },
        {
          id: ids.secondLine,
          merchantId: canonicalIds.merchant,
          orderId: canonicalIds.order,
          shopifyLineItemId: "gid://shopify/LineItem/900000000312",
          productId: ids.cloudDew,
          shopifyVariantId: "gid://shopify/ProductVariant/900000000222",
          sku: "JR-CDM-50",
          title: "Cloud Dew Moisturizer / 50 ml",
          quantity: 1,
          unitPriceMinor: 6400,
          currency: "USD",
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(schema.webhookReceipts)
      .values({
        id: ids.receipt,
        merchantId: canonicalIds.merchant,
        provider: "shopify",
        deliveryId: "00000000-0000-4000-8000-000000009001",
        topic: "orders/create",
        bodySha256:
          "e5f9c8e76dc7483171fefb20f57f1373d077f0df92a1814f8c6d38b2f7f95e82",
        receivedAt: at("2026-09-17T14:00:05.000Z"),
        processingStatus: "processed",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.commerceEvents)
      .values({
        id: canonicalIds.commerceEvent,
        merchantId: canonicalIds.merchant,
        customerId: canonicalIds.customer,
        orderId: canonicalIds.order,
        eventType: "order_completed",
        source: "shopify",
        sourceEventId: "shopify:orders-create:900000000302",
        occurredAt: at("2026-09-17T14:00:00.000Z"),
        ingestedAt: at("2026-09-17T14:00:05.000Z"),
        schemaVersion: 1,
        attributes: { customerOrderSequence: 2 },
        observedAttribution: { source: "meta", channel: "paid_social" },
        correlationId: canonicalIds.correlation,
      })
      .onConflictDoNothing();

    await tx
      .insert(schema.scripts)
      .values({
        id: ids.script,
        merchantId: canonicalIds.merchant,
        name: "Repeat skincare interview",
        status: "published",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.scriptVersions)
      .values({
        id: canonicalIds.scriptVersion,
        scriptId: ids.script,
        merchantId: canonicalIds.merchant,
        version: 1,
        status: "published",
        content: { prompts: ["discovery", "trigger", "texture"] },
        checksum: "canonical-script-v1",
        publishedAt: at("2026-09-01T04:00:00.000Z"),
      })
      .onConflictDoNothing();
    for (const [index, versionId] of fieldVersions.entries()) {
      const fieldId = `00000000-0000-7000-8000-${String(810 + index).padStart(12, "0")}`;
      await tx
        .insert(schema.researchFields)
        .values({
          id: fieldId,
          merchantId: index < 4 ? null : canonicalIds.merchant,
          key: `canonical.field.${index + 1}`,
          name: `Canonical field ${index + 1}`,
          status: "published",
        })
        .onConflictDoNothing();
      await tx
        .insert(schema.researchFieldVersions)
        .values({
          id: versionId,
          researchFieldId: fieldId,
          version: 1,
          definition: {
            schemaVersion: 1,
            valueType:
              index === 5 || index === 7 ? "rating_scale" : "single_select",
          },
          status: "published",
          publishedAt: at("2026-09-01T04:00:00.000Z"),
        })
        .onConflictDoNothing();
    }
    await tx
      .insert(schema.researchFieldSets)
      .values({
        id: ids.fieldSet,
        merchantId: canonicalIds.merchant,
        name: "Repeat skincare v1",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.researchFieldSetVersions)
      .values({
        id: canonicalIds.fieldSetVersion,
        researchFieldSetId: ids.fieldSet,
        version: 1,
        status: "published",
        publishedAt: at("2026-09-01T04:00:00.000Z"),
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.researchFieldSetItems)
      .values(
        fieldVersions.slice(0, 6).map((fieldVersionId, index) => ({
          fieldSetVersionId: canonicalIds.fieldSetVersion,
          fieldVersionId,
          source: index < 4 ? "platform_default" : "run_specific",
          required: true,
          displayOrder: index + 1,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(schema.researchMoments)
      .values({
        id: ids.moment,
        merchantId: canonicalIds.merchant,
        name: "Second purchase into skincare",
        status: "active",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.researchMomentVersions)
      .values({
        id: canonicalIds.researchMomentVersion,
        researchMomentId: ids.moment,
        merchantId: canonicalIds.merchant,
        version: 1,
        eventType: "order_completed",
        objective: "Understand repeat skincare discovery and trigger",
        cohortExpression: {
          schemaVersion: 1,
          all: [
            {
              predicate: "customer.order_sequence",
              version: 1,
              config: { operator: "equals", value: 2 },
            },
          ],
        },
        priority: 80,
        allocationPolicy: { weeklyCap: 10 },
        scriptVersionId: canonicalIds.scriptVersion,
        researchFieldSetVersionId: canonicalIds.fieldSetVersion,
        activeFrom: at("2026-09-01T04:00:00.000Z"),
        publishedAt: at("2026-09-01T04:00:00.000Z"),
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.qualificationEvaluations)
      .values({
        id: ids.evaluation,
        merchantId: canonicalIds.merchant,
        commerceEventId: canonicalIds.commerceEvent,
        researchMomentVersionId: canonicalIds.researchMomentVersion,
        engineVersion: "cohort-engine-v1",
        outcome: "qualified",
        reasonCodes: [
          "ORDER_SEQUENCE_EQUALS_2",
          "FIRST_ORDER_EXCLUDES_CURRENT_CATEGORY_SKINCARE",
          "CURRENT_ORDER_INCLUDES_CURRENT_CATEGORY_SKINCARE",
          "PHONE_CONTACT_ELIGIBLE",
          "ALLOCATION_AVAILABLE",
        ],
        inputSnapshot: {
          schemaVersion: 1,
          customerOrderSequence: 2,
          currentCategoryKey: "merchant:skincare",
          phone: "eligible",
        },
        evaluatedAt: at("2026-09-17T14:00:06.000Z"),
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.researchAssignments)
      .values({
        id: canonicalIds.assignment,
        merchantId: canonicalIds.merchant,
        researchMomentVersionId: canonicalIds.researchMomentVersion,
        qualificationEvaluationId: ids.evaluation,
        commerceEventId: canonicalIds.commerceEvent,
        customerId: canonicalIds.customer,
        orderId: canonicalIds.order,
        scriptVersionId: canonicalIds.scriptVersion,
        researchFieldSetVersionId: canonicalIds.fieldSetVersion,
        priority: 80,
        status: "completed",
        assignedResearcherId: canonicalIds.researcher,
        claimedAt: at("2026-09-17T14:02:00.000Z"),
        expiresAt: at("2026-09-18T14:00:06.000Z"),
        completedAt: at("2026-09-17T14:08:00.000Z"),
        attemptCount: 1,
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.interviews)
      .values({
        id: canonicalIds.interview,
        merchantId: canonicalIds.merchant,
        researchAssignmentId: canonicalIds.assignment,
        researcherId: canonicalIds.researcher,
        scriptVersionId: canonicalIds.scriptVersion,
        researchFieldSetVersionId: canonicalIds.fieldSetVersion,
        status: "completed",
        outcome: "completed",
        startedAt: at("2026-09-17T14:02:05.000Z"),
        endedAt: at("2026-09-17T14:08:00.000Z"),
        recordingConsent: "granted",
        transcriptStatus: "ready",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.calls)
      .values({
        id: ids.call,
        merchantId: canonicalIds.merchant,
        interviewId: canonicalIds.interview,
        provider: "fake_manual",
        providerCallRef: "fake-call-ec694231aa19bee5994d0740",
        status: "completed",
        startedAt: at("2026-09-17T14:02:05.000Z"),
        answeredAt: at("2026-09-17T14:02:12.000Z"),
        endedAt: at("2026-09-17T14:08:00.000Z"),
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.transcripts)
      .values({
        id: canonicalIds.transcript,
        merchantId: canonicalIds.merchant,
        interviewId: canonicalIds.interview,
        provider: "fake",
        providerRef: "fake-transcript-canonical-v1",
        language: "en-US",
        status: "ready",
        schemaVersion: 1,
        completedAt: at("2026-09-17T14:08:05.000Z"),
      })
      .onConflictDoNothing();
    const transcriptTexts = [
      "What first introduced you to Juniper Row?",
      "I first found the brand through a creator review, not through a Meta ad.",
      "What prompted today's purchase?",
      "The restock email reminded me, and that is when I decided to buy the moisturizer.",
      "How did the moisturizer texture feel?",
      "The texture felt ideal to me, and absorption was a five out of five.",
    ];
    await tx
      .insert(schema.transcriptSegments)
      .values(
        transcriptTexts.map((text, index) => ({
          id: segment(index + 1),
          merchantId: canonicalIds.merchant,
          transcriptId: canonicalIds.transcript,
          interviewId: canonicalIds.interview,
          sequence: index + 1,
          speaker: index % 2 === 0 ? "researcher" : "customer",
          startMs: [0, 10000, 25000, 35000, 51000, 62000][index],
          endMs: [9000, 24000, 34000, 50000, 61000, 78000][index],
          text,
          redactionStatus: "reviewed",
        })),
      )
      .onConflictDoNothing();
    const responseRows = [
      [canonicalIds.discoveryResponse, canonicalIds.discoveryField, "creator"],
      [canonicalIds.triggerResponse, canonicalIds.triggerField, "email"],
      [canonicalIds.influenceResponse, canonicalIds.influenceField, ["none"]],
      [canonicalIds.liquidityResponse, canonicalIds.liquidityField, "ideal"],
      [canonicalIds.absorptionResponse, canonicalIds.absorptionField, 5],
    ] as const;
    await tx
      .insert(schema.interviewResponses)
      .values(
        responseRows.map(([id, researchFieldVersionId, value]) => ({
          id,
          merchantId: canonicalIds.merchant,
          interviewId: canonicalIds.interview,
          researchFieldVersionId,
          researchFieldSetVersionId: canonicalIds.fieldSetVersion,
          value,
          provenance: "human_reviewed",
          provenanceDetails: {
            actorId: canonicalIds.researcher,
            source: "canonical_synthetic_interview",
          },
          reviewStatus: "accepted",
          createdBy: canonicalIds.researcher,
          reviewedBy: canonicalIds.researcher,
          reviewedAt: at("2026-09-17T14:08:00.000Z"),
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(schema.responseEvidence)
      .values([
        {
          responseId: canonicalIds.discoveryResponse,
          transcriptSegmentId: segment(2),
          merchantId: canonicalIds.merchant,
          startChar: 34,
          endChar: 48,
          excerptSnapshot: "creator review",
        },
        {
          responseId: canonicalIds.triggerResponse,
          transcriptSegmentId: segment(4),
          merchantId: canonicalIds.merchant,
          startChar: 12,
          endChar: 17,
          excerptSnapshot: "email",
        },
        {
          responseId: canonicalIds.influenceResponse,
          transcriptSegmentId: segment(2),
          merchantId: canonicalIds.merchant,
          startChar: 50,
          endChar: 71,
          excerptSnapshot: "not through a Meta ad",
        },
        {
          responseId: canonicalIds.liquidityResponse,
          transcriptSegmentId: segment(6),
          merchantId: canonicalIds.merchant,
          startChar: 17,
          endChar: 22,
          excerptSnapshot: "ideal",
        },
        {
          responseId: canonicalIds.absorptionResponse,
          transcriptSegmentId: segment(6),
          merchantId: canonicalIds.merchant,
          startChar: 51,
          endChar: 67,
          excerptSnapshot: "five out of five",
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(schema.interviewObservations)
      .values({
        id: canonicalIds.observation,
        merchantId: canonicalIds.merchant,
        interviewId: canonicalIds.interview,
        researcherId: canonicalIds.researcher,
        observationType: "notable_excitement",
        note: "Voice became faster and more animated when describing the texture.",
        interviewOffsetSeconds: 64,
        researchFieldVersionId: canonicalIds.liquidityField,
      })
      .onConflictDoNothing();

    await tx
      .insert(schema.angles)
      .values({
        id: canonicalIds.angle,
        merchantId: canonicalIds.merchant,
        reportingPeriodStart: periodStart,
        reportingPeriodEnd: periodEnd,
        category: "attribution",
        status: "published",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.angleRevisions)
      .values({
        id: canonicalIds.angleRevision,
        angleId: canonicalIds.angle,
        merchantId: canonicalIds.merchant,
        revision: 1,
        title:
          "Meta captured the session; creator discovery and email drove the journey",
        summary:
          "Observed Meta captured the session while the customer reported creator discovery and an email trigger.",
        researchQuestion:
          "What created discovery, and what triggered this purchase?",
        cohortDefinition: {
          key: "juniper-row-repeat-moisturizer-v1",
          version: 1,
        },
        recommendedAction:
          "Test creator-led discovery creative and distinguish discovery from email purchase triggers in attribution reviews.",
        caveat:
          "This synthetic one-interview sample demonstrates provenance and comparison behavior; it is not statistically representative.",
        status: "published",
        publishedAt: at("2026-10-01T14:00:00.000Z"),
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.angleEvidence)
      .values([
        {
          id: ids.angleEvidenceCreator,
          merchantId: canonicalIds.merchant,
          angleRevisionId: canonicalIds.angleRevision,
          responseId: canonicalIds.discoveryResponse,
          transcriptSegmentId: segment(2),
          displayOrder: 1,
        },
        {
          id: ids.angleEvidenceEmail,
          merchantId: canonicalIds.merchant,
          angleRevisionId: canonicalIds.angleRevision,
          responseId: canonicalIds.triggerResponse,
          transcriptSegmentId: segment(4),
          displayOrder: 2,
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(schema.angleMetrics)
      .values([
        {
          id: ids.metricObserved,
          merchantId: canonicalIds.merchant,
          angleRevisionId: canonicalIds.angleRevision,
          name: "Observed Meta-attributed qualifying orders",
          population: "commerce_population",
          numerator: 1,
          denominator: 1,
          value: "100",
          unit: "percent",
          cohortSnapshot: { key: "juniper-row-repeat-moisturizer-v1" },
          calculationVersion: "canonical-synthetic-v1",
          computedAt: at("2026-10-01T14:00:00.000Z"),
        },
        {
          id: ids.metricReported,
          merchantId: canonicalIds.merchant,
          angleRevisionId: canonicalIds.angleRevision,
          name: "Completed interviews reporting creator discovery",
          population: "interview_sample",
          numerator: 1,
          denominator: 1,
          value: "100",
          unit: "percent",
          cohortSnapshot: { key: "juniper-row-repeat-moisturizer-v1" },
          calculationVersion: "canonical-synthetic-v1",
          computedAt: at("2026-10-01T14:00:00.000Z"),
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(schema.reports)
      .values({
        id: canonicalIds.report,
        merchantId: canonicalIds.merchant,
        periodStart,
        periodEnd,
        displayMonth: "2026-09-01",
        status: "published",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.reportRevisions)
      .values({
        id: canonicalIds.reportRevision,
        reportId: canonicalIds.report,
        merchantId: canonicalIds.merchant,
        revision: 1,
        title: "Juniper Row — September 2026 Angles",
        executiveSummary:
          "Creator discovery and email purchase trigger differed from observed Meta session attribution.",
        methodology:
          "Synthetic second-purchase cohort with evidence-linked human-reviewed responses.",
        sampleNotes:
          "One completed synthetic interview; not statistically representative.",
        templateVersion: "angles-html-v1",
        status: "published",
        publishedAt: at("2026-10-01T14:00:00.000Z"),
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.reportAngles)
      .values({
        reportRevisionId: canonicalIds.reportRevision,
        angleRevisionId: canonicalIds.angleRevision,
        section: "attribution",
        displayOrder: 1,
        promotedToExecutiveSummary: true,
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.reportArtifacts)
      .values({
        id: ids.reportArtifact,
        merchantId: canonicalIds.merchant,
        reportRevisionId: canonicalIds.reportRevision,
        format: "html",
        contentSha256:
          "c328e0a21c2a4c41c4954bb863274fe4e0a6e11009b452afd38f3f8bb9f16b5f",
        objectKey: "synthetic/juniper-row/2026-09/angles-v1.html",
        generatedAt: at("2026-10-01T14:00:00.000Z"),
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.auditEvents)
      .values({
        id: ids.phoneRevealAudit,
        merchantId: canonicalIds.merchant,
        actorId: canonicalIds.researcher,
        action: "customer_private.phone_revealed",
        subjectType: "research_assignment",
        subjectId: canonicalIds.assignment,
        metadata: { reason: "explicit_manual_call_start", synthetic: true },
        occurredAt: at("2026-09-17T14:02:05.000Z"),
      })
      .onConflictDoNothing();
  });

  return {
    merchantId: canonicalIds.merchant,
    commerceEventId: canonicalIds.commerceEvent,
    assignmentId: canonicalIds.assignment,
    interviewId: canonicalIds.interview,
    reportId: canonicalIds.report,
  };
}

export const persistedCanonicalIds = { ...canonicalIds, ...ids } as const;
