import type {
  Clock,
  IdGenerator,
  ResearchFieldDefinitionV1,
  TenantContext,
} from "@holler/domain";
import {
  interviewObservationSchema,
  interviewResponseSchema,
  interviewSchema,
  researchFieldVersionRecordSchema,
  responseEvidenceSchema,
  transcriptSchema,
  transcriptSegmentSchema,
  type Interview,
  type InterviewObservation,
  type InterviewResponse,
  type InterviewResponseValue,
  type ResearchFieldVersionRecord,
  type ResponseEvidence,
  type ResponseProvenanceDetails,
  type Transcript,
  type TranscriptSegment,
} from "./models";
import type { EvidenceRepository } from "./repository";

export interface EvidenceSpanInput {
  readonly transcriptSegmentId: string;
  readonly startChar: number;
  readonly endChar: number;
}

export interface RecordResponseInput {
  readonly interviewId: string;
  readonly researchFieldVersionId: string;
  readonly value: InterviewResponseValue;
  readonly provenance: ResponseProvenanceDetails;
  readonly evidence: readonly EvidenceSpanInput[];
  readonly supersedesResponseId?: string;
}

export interface AddObservationInput {
  readonly interviewId: string;
  readonly observationType:
    | "hesitation"
    | "excitement"
    | "reluctance"
    | "confusion"
    | "strong_conviction"
    | "contradiction"
    | "context"
    | "follow_up_needed"
    | "other";
  readonly note: string;
  readonly interviewOffsetMs?: number;
  readonly scriptPromptKey?: string;
  readonly relatedResearchFieldVersionId?: string;
}

export class EvidenceService {
  constructor(
    private readonly repository: EvidenceRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  registerFieldVersion(
    input: ResearchFieldVersionRecord,
  ): ResearchFieldVersionRecord {
    const record = researchFieldVersionRecordSchema.parse(input);
    this.repository.saveFieldVersion(record);
    return record;
  }

  createInterview(
    context: TenantContext,
    input: Omit<Interview, "merchantId" | "createdAt">,
  ): Interview {
    const interview = interviewSchema.parse({
      ...input,
      merchantId: context.merchantId,
      createdAt: this.clock.now(),
    });
    this.repository.saveInterview(interview);
    return interview;
  }

  createTranscript(
    context: TenantContext,
    input: Omit<Transcript, "merchantId" | "createdAt">,
  ): Transcript {
    const interview = this.requireInterview(context, input.interviewId);
    const transcript = transcriptSchema.parse({
      ...input,
      merchantId: interview.merchantId,
      createdAt: this.clock.now(),
    });
    this.repository.saveTranscript(transcript);
    return transcript;
  }

  addTranscriptSegment(
    context: TenantContext,
    input: Omit<TranscriptSegment, "merchantId" | "interviewId" | "createdAt">,
  ): TranscriptSegment {
    const transcript = this.requireTranscript(context, input.transcriptId);
    const segment = transcriptSegmentSchema.parse({
      ...input,
      merchantId: transcript.merchantId,
      interviewId: transcript.interviewId,
      createdAt: this.clock.now(),
    });
    this.repository.saveTranscriptSegment(segment);
    return segment;
  }

  recordResponse(
    context: TenantContext,
    input: RecordResponseInput,
  ): InterviewResponse {
    const interview = this.requireInterview(context, input.interviewId);
    const fieldVersion = this.requireFieldVersion(
      context,
      input.researchFieldVersionId,
    );
    this.validateValue(fieldVersion.definition, input.value);

    const priorResponses = this.repository.listResponses(
      interview.id,
      fieldVersion.id,
    );
    const currentAccepted = priorResponses.findLast(
      (response) => response.reviewStatus === "accepted",
    );
    const isHuman =
      input.provenance.provenance === "human_live" ||
      input.provenance.provenance === "human_reviewed";

    if (
      isHuman &&
      (!context.actorId || context.actorId !== input.provenance.actorId)
    ) {
      throw new Error(
        "Human response provenance must match the authenticated actor",
      );
    }

    if (!isHuman && input.supersedesResponseId !== undefined) {
      throw new Error(
        "AI and imported responses cannot supersede a reviewed response",
      );
    }
    if (
      isHuman &&
      currentAccepted &&
      input.supersedesResponseId !== currentAccepted.id
    ) {
      throw new Error(
        `Accepted response ${currentAccepted.id} requires explicit supersession`,
      );
    }

    const spans = this.validateEvidenceSpans(
      context,
      interview.id,
      input.evidence,
    );
    if (fieldVersion.definition.evidenceExpected && spans.length === 0) {
      throw new Error(
        `Research field ${fieldVersion.id} requires transcript evidence`,
      );
    }

    const responseId = this.ids.next();
    const response = interviewResponseSchema.parse({
      id: responseId,
      merchantId: interview.merchantId,
      interviewId: interview.id,
      researchFieldVersionId: fieldVersion.id,
      researchFieldSetVersionId: interview.researchFieldSetVersionId,
      version: priorResponses.length + 1,
      value: input.value,
      provenance: input.provenance.provenance,
      provenanceDetails: input.provenance,
      reviewStatus: isHuman ? "accepted" : "suggested",
      supersedesResponseId: input.supersedesResponseId ?? null,
      conflictsWithResponseId:
        !isHuman && currentAccepted ? currentAccepted.id : null,
      createdAt: this.clock.now(),
    });

    if (isHuman && currentAccepted) {
      this.repository.supersedeAcceptedResponse(currentAccepted.id);
    }
    this.repository.saveResponse(response);
    for (const span of spans) {
      const evidence = responseEvidenceSchema.parse({
        id: this.ids.next(),
        merchantId: interview.merchantId,
        interviewResponseId: response.id,
        transcriptSegmentId: span.segment.id,
        startChar: span.startChar,
        endChar: span.endChar,
        createdAt: this.clock.now(),
      });
      this.repository.saveResponseEvidence(evidence);
    }
    return response;
  }

  addObservation(
    context: TenantContext,
    input: AddObservationInput,
  ): InterviewObservation {
    const interview = this.requireInterview(context, input.interviewId);
    if (input.relatedResearchFieldVersionId !== undefined) {
      this.requireFieldVersion(context, input.relatedResearchFieldVersionId);
    }
    if (!context.actorId)
      throw new Error("Researcher observation requires an actor");

    const observation = interviewObservationSchema.parse({
      id: this.ids.next(),
      merchantId: interview.merchantId,
      interviewId: interview.id,
      source: "researcher_observed",
      observationType: input.observationType,
      note: input.note,
      interviewOffsetMs: input.interviewOffsetMs ?? null,
      scriptPromptKey: input.scriptPromptKey ?? null,
      relatedResearchFieldVersionId:
        input.relatedResearchFieldVersionId ?? null,
      observedBy: context.actorId,
      createdAt: this.clock.now(),
    });
    this.repository.saveObservation(observation);
    return observation;
  }

  getCurrentAcceptedResponse(
    context: TenantContext,
    interviewId: string,
    researchFieldVersionId: string,
  ): InterviewResponse | undefined {
    this.requireInterview(context, interviewId);
    return this.repository
      .listResponses(interviewId, researchFieldVersionId)
      .findLast((response) => response.reviewStatus === "accepted");
  }

  listResponseEvidence(
    context: TenantContext,
    interviewResponseId: string,
  ): readonly ResponseEvidence[] {
    const response = this.repository.getResponse(interviewResponseId);
    if (!response || response.merchantId !== context.merchantId) {
      throw new Error("Interview response not found");
    }
    return this.repository.listResponseEvidence(interviewResponseId);
  }

  private requireInterview(context: TenantContext, id: string): Interview {
    const interview = this.repository.getInterview(id);
    if (!interview || interview.merchantId !== context.merchantId) {
      throw new Error("Interview not found");
    }
    return interview;
  }

  private requireTranscript(context: TenantContext, id: string): Transcript {
    const transcript = this.repository.getTranscript(id);
    if (!transcript || transcript.merchantId !== context.merchantId) {
      throw new Error("Transcript not found");
    }
    return transcript;
  }

  private requireFieldVersion(
    context: TenantContext,
    id: string,
  ): ResearchFieldVersionRecord {
    const fieldVersion = this.repository.getFieldVersion(id);
    if (
      !fieldVersion ||
      (fieldVersion.merchantId !== null &&
        fieldVersion.merchantId !== context.merchantId)
    ) {
      throw new Error("Research field version not found");
    }
    return fieldVersion;
  }

  private validateEvidenceSpans(
    context: TenantContext,
    interviewId: string,
    spans: readonly EvidenceSpanInput[],
  ): readonly {
    readonly segment: TranscriptSegment;
    readonly startChar: number;
    readonly endChar: number;
  }[] {
    return spans.map((span) => {
      const segment = this.repository.getTranscriptSegment(
        span.transcriptSegmentId,
      );
      if (
        !segment ||
        segment.merchantId !== context.merchantId ||
        segment.interviewId !== interviewId
      ) {
        throw new Error("Transcript evidence segment not found");
      }
      if (
        !Number.isInteger(span.startChar) ||
        !Number.isInteger(span.endChar) ||
        span.startChar < 0 ||
        span.endChar <= span.startChar ||
        span.endChar > segment.text.length
      ) {
        throw new Error(`Invalid evidence span for segment ${segment.id}`);
      }
      return { segment, startChar: span.startChar, endChar: span.endChar };
    });
  }

  private validateValue(
    definition: ResearchFieldDefinitionV1,
    value: InterviewResponseValue,
  ): void {
    const valid = (() => {
      switch (definition.valueType) {
        case "single_select":
          return (
            typeof value === "string" &&
            (definition.options ?? []).some((option) => option.key === value)
          );
        case "multi_select":
          return (
            Array.isArray(value) &&
            value.every((item) =>
              (definition.options ?? []).some((option) => option.key === item),
            )
          );
        case "boolean":
          return typeof value === "boolean";
        case "short_text":
          return typeof value === "string" && value.length <= 500;
        case "long_text":
          return typeof value === "string";
        case "integer":
          return typeof value === "number" && Number.isInteger(value);
        case "decimal":
          return typeof value === "number" && Number.isFinite(value);
        case "rating_scale":
          return typeof value === "number" && Number.isInteger(value);
      }
    })();
    if (!valid)
      throw new Error(`Invalid value for research field ${definition.key}`);
  }
}
