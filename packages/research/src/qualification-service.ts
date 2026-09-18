import type { Clock, IdGenerator, TenantContext } from "@holler/domain";
import { CohortExpressionEvaluator } from "./evaluator";
import type { QualificationRepository } from "./qualification-repository";
import {
  normalizedCommerceEventRecordSchema,
  publishedResearchMomentSchema,
  qualificationEvaluationSchema,
  researchAssignmentSchema,
  type NormalizedCommerceEventRecord,
  type PublishedResearchMoment,
  type QualificationEvaluation,
  type ResearchAssignment,
} from "./qualification-models";

export interface QualificationResult {
  readonly evaluation: QualificationEvaluation;
  readonly assignment: ResearchAssignment | undefined;
}

export class QualificationService {
  constructor(
    private readonly repository: QualificationRepository,
    private readonly evaluator: CohortExpressionEvaluator,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly engineVersion = "cohort-v1",
  ) {}

  async evaluate(
    context: TenantContext,
    eventInput: NormalizedCommerceEventRecord,
    momentInput: PublishedResearchMoment,
  ): Promise<QualificationResult> {
    const event = normalizedCommerceEventRecordSchema.parse(eventInput);
    const moment = publishedResearchMomentSchema.parse(momentInput);
    this.assertTenant(context, event, moment);

    const existingEvaluation = this.repository.getEvaluation(
      event.id,
      moment.id,
      this.engineVersion,
    );
    if (existingEvaluation) {
      return {
        evaluation: existingEvaluation,
        assignment: this.repository.getAssignment(event.id, moment.id),
      };
    }

    const evaluatedAt = this.clock.now();
    const occurredAt = new Date(event.event.occurredAt);
    const active =
      event.event.eventType === moment.eventType &&
      (moment.activeFrom === null || occurredAt >= moment.activeFrom) &&
      (moment.activeTo === null || occurredAt < moment.activeTo);

    const cohortResult = active
      ? await this.evaluator.evaluate(moment.cohort, {
          merchantId: event.event.merchantId,
          commerceEventId: event.id,
          occurredAt,
          correlationId: event.correlationId,
        })
      : {
          outcome: "no_match" as const,
          eligible: false,
          unknownReasons: [],
        };

    const candidateEvaluation = qualificationEvaluationSchema.parse({
      id: this.ids.next(),
      merchantId: event.event.merchantId,
      commerceEventId: event.id,
      researchMomentVersionId: moment.id,
      engineVersion: this.engineVersion,
      outcome: cohortResult.outcome,
      eligible: cohortResult.eligible,
      reasonCodes: active
        ? cohortResult.unknownReasons.length > 0
          ? cohortResult.unknownReasons.map((reason) => reason.reason)
          : [`cohort.${cohortResult.outcome}`]
        : ["moment.inactive_or_event_type_mismatch"],
      evaluatedAt,
    });
    const evaluation =
      this.repository.saveEvaluationIfAbsent(candidateEvaluation);

    if (!evaluation.eligible) return { evaluation, assignment: undefined };
    const expiresAt = new Date(occurredAt.getTime() + moment.assignmentTtlMs);
    const candidateAssignment = researchAssignmentSchema.parse({
      id: this.ids.next(),
      merchantId: event.event.merchantId,
      commerceEventId: event.id,
      researchMomentVersionId: moment.id,
      qualificationEvaluationId: evaluation.id,
      customerId: event.event.customerId,
      orderId: event.event.orderId,
      scriptVersionId: moment.scriptVersionId,
      researchFieldSetVersionId: moment.researchFieldSetVersionId,
      priority: moment.priority,
      status: expiresAt <= evaluatedAt ? "expired" : "queued",
      assignedResearcherId: null,
      createdAt: evaluatedAt,
      expiresAt,
      claimedAt: null,
      interviewStartedAt: null,
      lockVersion: 0,
    });
    const assignment =
      this.repository.saveAssignmentIfAbsent(candidateAssignment);
    return { evaluation, assignment };
  }

  private assertTenant(
    context: TenantContext,
    event: NormalizedCommerceEventRecord,
    moment: PublishedResearchMoment,
  ): void {
    if (
      event.event.merchantId !== context.merchantId ||
      moment.merchantId !== context.merchantId
    ) {
      throw new Error("Qualification resource not found");
    }
  }
}
