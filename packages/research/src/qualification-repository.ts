import type {
  InterviewHandoff,
  QualificationEvaluation,
  ResearchAssignment,
} from "./qualification-models";

export interface ClaimAssignmentInput {
  readonly assignmentId: string;
  readonly merchantId: string;
  readonly researcherId: string;
  readonly expectedLockVersion: number;
  readonly claimedAt: Date;
}

export interface StartInterviewInput {
  readonly assignmentId: string;
  readonly merchantId: string;
  readonly researcherId: string;
  readonly expectedLockVersion: number;
  readonly startedAt: Date;
  readonly handoff: InterviewHandoff;
}

export type AssignmentTransitionResult =
  | { readonly outcome: "updated"; readonly assignment: ResearchAssignment }
  | {
      readonly outcome: "conflict";
      readonly assignment: ResearchAssignment | undefined;
    }
  | { readonly outcome: "expired"; readonly assignment: ResearchAssignment };

export interface QualificationRepository {
  getEvaluation(
    commerceEventId: string,
    researchMomentVersionId: string,
    engineVersion: string,
  ): QualificationEvaluation | undefined;
  saveEvaluationIfAbsent(
    evaluation: QualificationEvaluation,
  ): QualificationEvaluation;

  getAssignment(
    commerceEventId: string,
    researchMomentVersionId: string,
  ): ResearchAssignment | undefined;
  getAssignmentById(id: string): ResearchAssignment | undefined;
  saveAssignmentIfAbsent(assignment: ResearchAssignment): ResearchAssignment;
  listAssignments(merchantId: string): readonly ResearchAssignment[];

  claimAssignment(input: ClaimAssignmentInput): AssignmentTransitionResult;
  startInterview(input: StartInterviewInput): AssignmentTransitionResult;
  expireAssignmentIfDue(
    assignmentId: string,
    merchantId: string,
    now: Date,
  ): ResearchAssignment | undefined;

  getInterviewHandoff(
    researchAssignmentId: string,
  ): InterviewHandoff | undefined;
  listInterviewHandoffs(merchantId: string): readonly InterviewHandoff[];
}

export class InMemoryQualificationRepository implements QualificationRepository {
  readonly #evaluationsByKey = new Map<string, QualificationEvaluation>();
  readonly #assignmentsByKey = new Map<string, ResearchAssignment>();
  readonly #assignmentsById = new Map<string, ResearchAssignment>();
  readonly #handoffsByAssignment = new Map<string, InterviewHandoff>();

  getEvaluation(
    commerceEventId: string,
    researchMomentVersionId: string,
    engineVersion: string,
  ): QualificationEvaluation | undefined {
    return this.#evaluationsByKey.get(
      this.#evaluationKey(
        commerceEventId,
        researchMomentVersionId,
        engineVersion,
      ),
    );
  }

  saveEvaluationIfAbsent(
    evaluation: QualificationEvaluation,
  ): QualificationEvaluation {
    const key = this.#evaluationKey(
      evaluation.commerceEventId,
      evaluation.researchMomentVersionId,
      evaluation.engineVersion,
    );
    const existing = this.#evaluationsByKey.get(key);
    if (existing) return existing;
    this.#evaluationsByKey.set(key, evaluation);
    return evaluation;
  }

  getAssignment(
    commerceEventId: string,
    researchMomentVersionId: string,
  ): ResearchAssignment | undefined {
    return this.#assignmentsByKey.get(
      this.#assignmentKey(commerceEventId, researchMomentVersionId),
    );
  }

  getAssignmentById(id: string): ResearchAssignment | undefined {
    return this.#assignmentsById.get(id);
  }

  saveAssignmentIfAbsent(assignment: ResearchAssignment): ResearchAssignment {
    const key = this.#assignmentKey(
      assignment.commerceEventId,
      assignment.researchMomentVersionId,
    );
    const existing = this.#assignmentsByKey.get(key);
    if (existing) return existing;
    this.#assignmentsByKey.set(key, assignment);
    this.#assignmentsById.set(assignment.id, assignment);
    return assignment;
  }

  listAssignments(merchantId: string): readonly ResearchAssignment[] {
    return [...this.#assignmentsById.values()].filter(
      (assignment) => assignment.merchantId === merchantId,
    );
  }

  claimAssignment(input: ClaimAssignmentInput): AssignmentTransitionResult {
    const assignment = this.#assignmentsById.get(input.assignmentId);
    if (
      !assignment ||
      assignment.merchantId !== input.merchantId ||
      assignment.status !== "queued" ||
      assignment.lockVersion !== input.expectedLockVersion
    ) {
      return { outcome: "conflict", assignment };
    }
    if (assignment.expiresAt <= input.claimedAt) {
      const expired = this.#replaceAssignment({
        ...assignment,
        status: "expired",
        lockVersion: assignment.lockVersion + 1,
      });
      return { outcome: "expired", assignment: expired };
    }
    const claimed = this.#replaceAssignment({
      ...assignment,
      status: "claimed",
      assignedResearcherId: input.researcherId,
      claimedAt: input.claimedAt,
      lockVersion: assignment.lockVersion + 1,
    });
    return { outcome: "updated", assignment: claimed };
  }

  startInterview(input: StartInterviewInput): AssignmentTransitionResult {
    const assignment = this.#assignmentsById.get(input.assignmentId);
    if (
      !assignment ||
      assignment.merchantId !== input.merchantId ||
      assignment.status !== "claimed" ||
      assignment.assignedResearcherId !== input.researcherId ||
      assignment.lockVersion !== input.expectedLockVersion ||
      this.#handoffsByAssignment.has(input.assignmentId)
    ) {
      return { outcome: "conflict", assignment };
    }
    if (assignment.expiresAt <= input.startedAt) {
      const expired = this.#replaceAssignment({
        ...assignment,
        status: "expired",
        lockVersion: assignment.lockVersion + 1,
      });
      return { outcome: "expired", assignment: expired };
    }
    const started = this.#replaceAssignment({
      ...assignment,
      status: "interview_started",
      interviewStartedAt: input.startedAt,
      lockVersion: assignment.lockVersion + 1,
    });
    this.#handoffsByAssignment.set(input.assignmentId, input.handoff);
    return { outcome: "updated", assignment: started };
  }

  expireAssignmentIfDue(
    assignmentId: string,
    merchantId: string,
    now: Date,
  ): ResearchAssignment | undefined {
    const assignment = this.#assignmentsById.get(assignmentId);
    if (!assignment || assignment.merchantId !== merchantId) return undefined;
    if (
      assignment.expiresAt <= now &&
      (assignment.status === "queued" || assignment.status === "claimed")
    ) {
      return this.#replaceAssignment({
        ...assignment,
        status: "expired",
        lockVersion: assignment.lockVersion + 1,
      });
    }
    return assignment;
  }

  getInterviewHandoff(
    researchAssignmentId: string,
  ): InterviewHandoff | undefined {
    return this.#handoffsByAssignment.get(researchAssignmentId);
  }

  listInterviewHandoffs(merchantId: string): readonly InterviewHandoff[] {
    return [...this.#handoffsByAssignment.values()].filter(
      (handoff) => handoff.merchantId === merchantId,
    );
  }

  #replaceAssignment(assignment: ResearchAssignment): ResearchAssignment {
    const key = this.#assignmentKey(
      assignment.commerceEventId,
      assignment.researchMomentVersionId,
    );
    this.#assignmentsByKey.set(key, assignment);
    this.#assignmentsById.set(assignment.id, assignment);
    return assignment;
  }

  #evaluationKey(
    eventId: string,
    momentId: string,
    engineVersion: string,
  ): string {
    return `${eventId}\u0000${momentId}\u0000${engineVersion}`;
  }

  #assignmentKey(eventId: string, momentId: string): string {
    return `${eventId}\u0000${momentId}`;
  }
}
