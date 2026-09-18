import {
  type Clock,
  type CohortExpression,
  type IdGenerator,
  type TenantContext,
} from "@holler/domain";
import {
  EvidenceService,
  InMemoryEvidenceRepository,
  type InterviewObservation,
  type InterviewResponse,
  type ResponseEvidence,
} from "@holler/evidence";
import {
  FakeDialerProvider,
  FakeTranscriptionProvider,
} from "@holler/providers";
import {
  renderReportHtml,
  type AngleMetric,
  type AngleRenderModel,
  type CohortSnapshot,
  type ReportRenderModel,
  type ReportingPeriod,
} from "@holler/reporting";
import {
  CohortExpressionEvaluator,
  createInitialCohortPredicateRegistry,
  type CohortEvaluationResult,
  type CohortQueryFact,
  type CohortQueryRepository,
  type CurrentCategoryReference,
  type ResearchCohortQueryContext,
} from "@holler/research";
import {
  buildSyntheticShopifyOrderIngress,
  normalizeShopifyOrderIngress,
  type NormalizedShopifyCommerceEvent,
} from "@holler/shopify";

export const canonicalIds = {
  merchant: "00000000-0000-7000-8000-000000000001",
  researcher: "00000000-0000-7000-8000-000000000002",
  customer: "00000000-0000-7000-8000-000000000101",
  order: "00000000-0000-7000-8000-000000000302",
  commerceEvent: "00000000-0000-7000-8000-000000000402",
  correlation: "00000000-0000-7000-8000-000000000403",
  scriptVersion: "00000000-0000-7000-8000-000000000502",
  researchMomentVersion: "00000000-0000-7000-8000-000000000512",
  fieldSetVersion: "00000000-0000-7000-8000-000000000513",
  assignment: "00000000-0000-7000-8000-000000000522",
  interview: "00000000-0000-7000-8000-000000000531",
  recording: "00000000-0000-7000-8000-000000000533",
  transcript: "00000000-0000-7000-8000-000000000534",
  observation: "00000000-0000-7000-8000-000000000535",
  discoveryField: "00000000-0000-7000-8000-000000000541",
  triggerField: "00000000-0000-7000-8000-000000000542",
  influenceField: "00000000-0000-7000-8000-000000000543",
  liquidityField: "00000000-0000-7000-8000-000000000545",
  absorptionField: "00000000-0000-7000-8000-000000000546",
  discoveryResponse: "00000000-0000-7000-8000-000000000601",
  triggerResponse: "00000000-0000-7000-8000-000000000602",
  influenceResponse: "00000000-0000-7000-8000-000000000603",
  liquidityResponse: "00000000-0000-7000-8000-000000000604",
  absorptionResponse: "00000000-0000-7000-8000-000000000605",
  creatorEvidence: "00000000-0000-7000-8000-000000000611",
  metaEvidence: "00000000-0000-7000-8000-000000000612",
  emailEvidence: "00000000-0000-7000-8000-000000000613",
  liquidityEvidence: "00000000-0000-7000-8000-000000000614",
  absorptionEvidence: "00000000-0000-7000-8000-000000000615",
  angle: "00000000-0000-7000-8000-000000000701",
  angleRevision: "00000000-0000-7000-8000-000000000702",
  report: "00000000-0000-7000-8000-000000000711",
  reportRevision: "00000000-0000-7000-8000-000000000712",
} as const;

const period: ReportingPeriod = {
  start: "2026-09-01T04:00:00.000Z",
  end: "2026-10-01T04:00:00.000Z",
  displayMonth: "2026-09-01",
};

const cohort: CohortSnapshot = {
  key: "juniper-row-repeat-moisturizer-v1",
  label: "Second purchase into skincare",
  definitionVersion: 1,
};

export interface SyntheticAssignmentHandoff {
  readonly id: string;
  readonly commerceEventId: string;
  readonly researchMomentVersionId: string;
  readonly customerId: string;
  readonly orderId: string;
  readonly status: "queued";
}

export interface CanonicalSyntheticFlowResult {
  readonly commerce: NormalizedShopifyCommerceEvent;
  readonly qualification: CohortEvaluationResult;
  readonly queue: readonly SyntheticAssignmentHandoff[];
  readonly call: {
    readonly providerCallReference: string;
    readonly finalStatus: string;
  };
  readonly responses: {
    readonly discovery: InterviewResponse;
    readonly trigger: InterviewResponse;
    readonly influence: InterviewResponse;
    readonly liquidity: InterviewResponse;
    readonly absorption: InterviewResponse;
  };
  readonly responseEvidence: readonly ResponseEvidence[];
  readonly observation: InterviewObservation;
  readonly attributionComparison: {
    readonly observed: {
      readonly source: string | null;
      readonly channel: string | null;
    };
    readonly selfReported: {
      readonly discovery: InterviewResponse["value"];
      readonly trigger: InterviewResponse["value"];
      readonly influence: InterviewResponse["value"];
    };
  };
  readonly canonicalAngle: AngleRenderModel;
  readonly report: ReportRenderModel;
  readonly html: string;
}

class CanonicalCohortRepository implements CohortQueryRepository {
  private assertScope(context: ResearchCohortQueryContext): void {
    if (
      context.merchantId !== canonicalIds.merchant ||
      context.commerceEventId !== canonicalIds.commerceEvent
    ) {
      throw new Error(
        "Canonical cohort query received an unexpected tenant scope",
      );
    }
  }

  async getCustomerOrderSequence(
    context: ResearchCohortQueryContext,
  ): Promise<CohortQueryFact<number>> {
    this.assertScope(context);
    return { state: "known", value: 2 };
  }

  async currentOrderContainsCurrentCategory(
    context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    this.assertScope(context);
    return {
      state: "known",
      value: category.namespace === "merchant" && category.key === "skincare",
    };
  }

  async firstOrderContainsCurrentCategory(
    context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    this.assertScope(context);
    if (category.namespace !== "merchant" || category.key !== "skincare") {
      return { state: "known", value: false };
    }
    return { state: "known", value: false };
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-09-17T14:08:05.000Z");
  }
}

class FixedIdSequence implements IdGenerator {
  readonly #ids = [
    canonicalIds.discoveryResponse,
    canonicalIds.creatorEvidence,
    canonicalIds.triggerResponse,
    canonicalIds.emailEvidence,
    canonicalIds.influenceResponse,
    canonicalIds.metaEvidence,
    canonicalIds.liquidityResponse,
    canonicalIds.liquidityEvidence,
    canonicalIds.absorptionResponse,
    canonicalIds.absorptionEvidence,
    canonicalIds.observation,
  ];
  #index = 0;

  next(): string {
    const id = this.#ids[this.#index];
    if (id === undefined) throw new Error("Canonical ID sequence exhausted");
    this.#index += 1;
    return id;
  }
}

export async function runCanonicalSyntheticFlow(): Promise<CanonicalSyntheticFlowResult> {
  const commerce = normalizeCanonicalSecondOrder();
  const qualification = await evaluateCanonicalCohort(commerce);
  if (!qualification.eligible) {
    throw new Error("Canonical category-transition cohort did not qualify");
  }

  const assignment: SyntheticAssignmentHandoff = {
    id: canonicalIds.assignment,
    commerceEventId: canonicalIds.commerceEvent,
    researchMomentVersionId: canonicalIds.researchMomentVersion,
    customerId: canonicalIds.customer,
    orderId: canonicalIds.order,
    status: "queued",
  };
  const queue = Object.freeze([assignment]);

  // This invocation is deliberately after the queue handoff: qualification
  // never starts a call on its own.
  const dialer = new FakeDialerProvider();
  const callSession = await dialer.startCall({
    merchantId: canonicalIds.merchant,
    interviewId: canonicalIds.interview,
    customerPrivateRef: canonicalIds.customer,
    idempotencyKey: "juniper-row-repeat-moisturizer-v1:start-call",
  });
  await dialer.simulateAnswered(callSession.providerCallReference);
  await dialer.endCall(callSession.providerCallReference);

  const transcription = new FakeTranscriptionProvider();
  const transcriptionJob = await transcription.submitRecording({
    recordingRef: canonicalIds.recording,
    idempotencyKey: "juniper-row-repeat-moisturizer-v1:transcribe",
  });
  const transcriptSegments = await transcription.getTranscript(
    transcriptionJob.providerJobRef,
  );

  const repository = new InMemoryEvidenceRepository();
  const evidence = new EvidenceService(
    repository,
    new FixedClock(),
    new FixedIdSequence(),
  );
  const context: TenantContext = {
    merchantId: canonicalIds.merchant as TenantContext["merchantId"],
    actorId: canonicalIds.researcher as NonNullable<TenantContext["actorId"]>,
    correlationId: canonicalIds.correlation,
  };

  registerCanonicalFields(evidence);
  evidence.createInterview(context, {
    id: canonicalIds.interview,
    researchAssignmentId: canonicalIds.assignment,
    researcherId: canonicalIds.researcher,
    scriptVersionId: canonicalIds.scriptVersion,
    researchFieldSetVersionId: canonicalIds.fieldSetVersion,
    status: "completed",
    startedAt: new Date("2026-09-17T14:02:05.000Z"),
    endedAt: new Date("2026-09-17T14:08:00.000Z"),
  });
  evidence.createTranscript(context, {
    id: canonicalIds.transcript,
    interviewId: canonicalIds.interview,
    revision: 1,
    status: "ready",
    language: "en-US",
  });
  for (const segment of transcriptSegments) {
    evidence.addTranscriptSegment(context, {
      id: `00000000-0000-7000-8000-${String(560 + segment.sequence).padStart(12, "0")}`,
      transcriptId: canonicalIds.transcript,
      sequence: segment.sequence,
      speaker: segment.speaker,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
    });
  }

  const humanReviewed = {
    provenance: "human_reviewed" as const,
    actorId: canonicalIds.researcher,
  };
  const responses = {
    discovery: evidence.recordResponse(context, {
      interviewId: canonicalIds.interview,
      researchFieldVersionId: canonicalIds.discoveryField,
      value: "creator",
      provenance: humanReviewed,
      evidence: [
        { transcriptSegmentId: segmentId(2), startChar: 34, endChar: 48 },
      ],
    }),
    trigger: evidence.recordResponse(context, {
      interviewId: canonicalIds.interview,
      researchFieldVersionId: canonicalIds.triggerField,
      value: "email",
      provenance: humanReviewed,
      evidence: [
        { transcriptSegmentId: segmentId(4), startChar: 12, endChar: 17 },
      ],
    }),
    influence: evidence.recordResponse(context, {
      interviewId: canonicalIds.interview,
      researchFieldVersionId: canonicalIds.influenceField,
      value: ["none"],
      provenance: humanReviewed,
      evidence: [
        { transcriptSegmentId: segmentId(2), startChar: 50, endChar: 71 },
      ],
    }),
    liquidity: evidence.recordResponse(context, {
      interviewId: canonicalIds.interview,
      researchFieldVersionId: canonicalIds.liquidityField,
      value: "ideal",
      provenance: humanReviewed,
      evidence: [
        { transcriptSegmentId: segmentId(6), startChar: 17, endChar: 22 },
      ],
    }),
    absorption: evidence.recordResponse(context, {
      interviewId: canonicalIds.interview,
      researchFieldVersionId: canonicalIds.absorptionField,
      value: 5,
      provenance: humanReviewed,
      evidence: [
        { transcriptSegmentId: segmentId(6), startChar: 51, endChar: 67 },
      ],
    }),
  };
  const observation = evidence.addObservation(context, {
    interviewId: canonicalIds.interview,
    observationType: "excitement",
    note: "Voice became faster and more animated when describing the texture.",
    interviewOffsetMs: 64_000,
    scriptPromptKey: "moisturizer_texture",
    relatedResearchFieldVersionId: canonicalIds.liquidityField,
  });

  const responseEvidence = Object.values(responses).flatMap((response) =>
    evidence.listResponseEvidence(context, response.id),
  );
  const attributionComparison = {
    observed: {
      source: commerce.event.observedAttribution.source,
      channel: commerce.event.observedAttribution.channel,
    },
    selfReported: {
      discovery: responses.discovery.value,
      trigger: responses.trigger.value,
      influence: responses.influence.value,
    },
  };

  const { report, canonicalAngle } = buildCanonicalReport(
    responseEvidence,
    observation,
  );
  const html = renderReportHtml(report);

  return {
    commerce,
    qualification,
    queue,
    call: {
      providerCallReference: callSession.providerCallReference,
      finalStatus: await dialer.getCallStatus(
        callSession.providerCallReference,
      ),
    },
    responses,
    responseEvidence,
    observation,
    attributionComparison,
    canonicalAngle,
    report,
    html,
  };
}

function normalizeCanonicalSecondOrder(): NormalizedShopifyCommerceEvent {
  const fixture = buildSyntheticShopifyOrderIngress({
    webhookId: "00000000-0000-4000-8000-000000009001",
    eventId: canonicalIds.commerceEvent,
    shopDomain: "juniper-row-synthetic.myshopify.com",
    customer: {
      id: "gid://shopify/Customer/900000000101",
      phone: "+12025550142",
      firstName: "Casey Example",
    },
    observedAttribution: {
      source: "meta",
      channel: "paid_social",
      campaign: "cloud-dew-retargeting",
      landingPath: "/products/cloud-dew-moisturizer",
      observedAt: "2026-09-17T14:00:00.000Z",
    },
  });
  const ingress = {
    ...fixture,
    order: {
      ...fixture.order,
      id: "gid://shopify/Order/900000000302",
      total: { amount: "64.00", currency: "USD" },
      lineItems: [
        {
          id: "gid://shopify/LineItem/900000000312",
          productId: "gid://shopify/Product/900000000221",
          variantId: "gid://shopify/ProductVariant/900000000222",
          sku: "JR-CDM-50",
          title: "Cloud Dew Moisturizer / 50 ml",
          quantity: 1,
          unitPrice: { amount: "64.00", currency: "USD" },
        },
      ],
    },
  };

  return normalizeShopifyOrderIngress(ingress, {
    merchantId: canonicalIds.merchant,
    orderId: canonicalIds.order,
    customerId: canonicalIds.customer,
    customerOrderSequence: 2,
    historyCompleteness: {
      state: "complete",
      historyStartAt: "2026-08-14T16:30:00.000Z",
      reason: "full_import",
    },
    catalogEnrichment: {
      state: "ready",
      refreshedAt: "2026-09-17T13:59:00.000Z",
    },
  });
}

async function evaluateCanonicalCohort(
  commerce: NormalizedShopifyCommerceEvent,
): Promise<CohortEvaluationResult> {
  const expression: CohortExpression = {
    all: [
      {
        predicate: "customer.order_sequence",
        version: 1,
        config: { operator: "equals", value: 2 },
      },
      {
        not: {
          predicate: "customer.first_order_contains_current_category",
          version: 1,
          config: { namespace: "merchant", categoryKey: "skincare" },
        },
      },
      {
        predicate: "order.contains_current_category",
        version: 1,
        config: { namespace: "merchant", categoryKey: "skincare" },
      },
    ],
  };
  const evaluator = new CohortExpressionEvaluator(
    createInitialCohortPredicateRegistry(new CanonicalCohortRepository()),
  );
  return evaluator.evaluate(expression, {
    merchantId: commerce.event.merchantId,
    commerceEventId: canonicalIds.commerceEvent,
    occurredAt: new Date(commerce.event.occurredAt),
    correlationId: canonicalIds.correlation,
  });
}

function registerCanonicalFields(evidence: EvidenceService): void {
  const shared = {
    schemaVersion: 1 as const,
    required: true,
    evidenceExpected: true,
    completionMode: "any" as const,
  };
  evidence.registerFieldVersion({
    id: canonicalIds.discoveryField,
    merchantId: null,
    version: 1,
    definition: {
      ...shared,
      key: "attribution_discovery_source",
      label: "Discovery source",
      prompt: "What first introduced you to Juniper Row?",
      valueType: "single_select",
      options: [
        { key: "creator", label: "Creator" },
        { key: "meta", label: "Meta" },
      ],
      attributionSemantic: "self_reported_discovery",
    },
  });
  evidence.registerFieldVersion({
    id: canonicalIds.triggerField,
    merchantId: null,
    version: 1,
    definition: {
      ...shared,
      key: "attribution_purchase_trigger",
      label: "Purchase trigger",
      prompt: "What prompted today's purchase?",
      valueType: "single_select",
      options: [
        { key: "email", label: "Email" },
        { key: "paid_ad", label: "Paid ad" },
      ],
      attributionSemantic: "self_reported_trigger",
    },
  });
  evidence.registerFieldVersion({
    id: canonicalIds.influenceField,
    merchantId: null,
    version: 1,
    definition: {
      ...shared,
      key: "attribution_influence",
      label: "Marketing influence",
      prompt: "What marketing influenced the purchase?",
      valueType: "multi_select",
      options: [
        { key: "none", label: "None" },
        { key: "meta", label: "Meta" },
        { key: "email", label: "Email" },
      ],
      attributionSemantic: "self_reported_influence",
    },
  });
  evidence.registerFieldVersion({
    id: canonicalIds.liquidityField,
    merchantId: canonicalIds.merchant,
    version: 1,
    definition: {
      ...shared,
      key: "moisturizer_texture_liquidity",
      label: "Moisturizer texture liquidity",
      prompt: "How did the moisturizer texture feel?",
      valueType: "single_select",
      options: [
        { key: "too_runny", label: "Too runny" },
        { key: "ideal", label: "Ideal" },
        { key: "too_thick", label: "Too thick" },
      ],
      attributionSemantic: null,
    },
  });
  evidence.registerFieldVersion({
    id: canonicalIds.absorptionField,
    merchantId: canonicalIds.merchant,
    version: 1,
    definition: {
      ...shared,
      key: "moisturizer_absorption",
      label: "Moisturizer absorption",
      prompt: "Rate absorption from one to five.",
      valueType: "rating_scale",
      attributionSemantic: null,
    },
  });
}

function segmentId(sequence: number): string {
  return `00000000-0000-7000-8000-${String(560 + sequence).padStart(12, "0")}`;
}

function buildCanonicalReport(
  responseEvidence: readonly ResponseEvidence[],
  observation: InterviewObservation,
): {
  readonly report: ReportRenderModel;
  readonly canonicalAngle: AngleRenderModel;
} {
  const evidenceById = new Map(
    responseEvidence.map((reference) => [reference.id, reference]),
  );
  for (const required of [
    canonicalIds.creatorEvidence,
    canonicalIds.emailEvidence,
    canonicalIds.liquidityEvidence,
  ]) {
    if (!evidenceById.has(required)) {
      throw new Error("Canonical response evidence is incomplete");
    }
  }

  const observedMetric = metric({
    id: "00000000-0000-7000-8000-000000000731",
    name: "Observed Meta-attributed qualifying orders",
    source: "observed_commerce",
    population: "commerce_population",
  });
  const creatorMetric = metric({
    id: "00000000-0000-7000-8000-000000000732",
    name: "Completed interviews reporting creator discovery",
    source: "self_reported_interview",
    population: "interview_sample",
  });
  const canonicalAngle = angle({
    id: canonicalIds.angle,
    revisionId: canonicalIds.angleRevision,
    title:
      "Meta captured the session; creator discovery and email drove the journey",
    summary:
      "Observed Meta captured the purchase session while the customer reported creator discovery and an email purchase trigger.",
    evidenceIds: [canonicalIds.creatorEvidence, canonicalIds.emailEvidence],
    metrics: [observedMetric, creatorMetric],
  });
  const textureAngle = angle({
    id: "00000000-0000-7000-8000-000000000703",
    revisionId: "00000000-0000-7000-8000-000000000704",
    title: "Ideal moisturizer texture generated notable excitement",
    summary:
      "The customer rated the texture ideal, while the researcher recorded notable excitement that was not available in the transcript alone.",
    evidenceIds: [canonicalIds.liquidityEvidence, observation.id],
    metrics: [
      metric({
        id: "00000000-0000-7000-8000-000000000733",
        name: "Interviewed customers describing texture as ideal",
        source: "self_reported_interview",
        population: "interview_sample",
      }),
    ],
  });
  const triggerAngle = angle({
    id: "00000000-0000-7000-8000-000000000705",
    revisionId: "00000000-0000-7000-8000-000000000706",
    title: "Email was the immediate purchase trigger",
    summary:
      "The customer separated original creator discovery from the email that triggered the second purchase.",
    evidenceIds: [canonicalIds.emailEvidence],
    metrics: [
      metric({
        id: "00000000-0000-7000-8000-000000000734",
        name: "Completed interviews reporting an email trigger",
        source: "self_reported_interview",
        population: "interview_sample",
      }),
    ],
  });

  return {
    canonicalAngle,
    report: {
      schemaVersion: 1,
      templateVersion: "angles-html-v1",
      reportId: canonicalIds.report,
      revisionId: canonicalIds.reportRevision,
      merchantName: "Juniper Row",
      title: "Juniper Row — September 2026 Angles",
      period,
      generatedAt: "2026-10-01T14:00:00.000Z",
      methodology:
        "Synthetic second-purchase cohort evaluated against current catalog categories; interview findings remain linked to reviewed evidence.",
      sampleNotes:
        "One completed synthetic interview. Commerce and interview-sample metrics use separate populations and are not statistically representative.",
      angles: [canonicalAngle, textureAngle, triggerAngle],
      executiveAngleIds: [canonicalAngle.id, textureAngle.id, triggerAngle.id],
    },
  };
}

function metric(input: {
  readonly id: string;
  readonly name: string;
  readonly source: AngleMetric["source"];
  readonly population: AngleMetric["population"];
}): AngleMetric {
  return {
    ...input,
    unit: "percent",
    value: 100,
    numerator: 1,
    denominator: 1,
    cohort,
    period,
    calculationVersion: "canonical-synthetic-v1",
  };
}

function angle(input: {
  readonly id: string;
  readonly revisionId: string;
  readonly title: string;
  readonly summary: string;
  readonly evidenceIds: readonly string[];
  readonly metrics: readonly AngleMetric[];
}): AngleRenderModel {
  return {
    id: input.id,
    revisionId: input.revisionId,
    title: input.title,
    summary: input.summary,
    researchQuestion:
      "What created discovery, and what triggered this purchase?",
    cohort,
    period,
    caveat:
      "This synthetic one-interview sample demonstrates provenance and comparison behavior; it is not statistically representative.",
    recommendedAction:
      "Test creator-led discovery creative and distinguish discovery from email purchase triggers in attribution reviews.",
    evidence: input.evidenceIds.map((evidenceId) => ({
      evidenceId,
      interviewId: canonicalIds.interview,
      kind:
        evidenceId === canonicalIds.observation
          ? ("researcher_observation" as const)
          : ("response_evidence" as const),
      label:
        evidenceId === canonicalIds.observation
          ? "Researcher-observed excitement"
          : "Reviewed transcript evidence",
    })),
    metrics: [...input.metrics],
  };
}
