import type { Clock, IdGenerator, TenantContext } from "@holler/domain";
import type { QualificationRepository } from "./qualification-repository";
import {
  interviewHandoffSchema,
  type InterviewHandoff,
  type ResearchAssignment,
} from "./qualification-models";

export class AssignmentTransitionError extends Error {
  constructor(
    readonly code: "not_found" | "conflict" | "expired" | "actor_required",
  ) {
    super(`Assignment transition failed: ${code}`);
    this.name = "AssignmentTransitionError";
  }
}

export class ResearchAssignmentQueue {
  constructor(
    private readonly repository: QualificationRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  listActionable(context: TenantContext): readonly ResearchAssignment[] {
    const now = this.clock.now();
    for (const assignment of this.repository.listAssignments(
      context.merchantId,
    )) {
      this.repository.expireAssignmentIfDue(
        assignment.id,
        context.merchantId,
        now,
      );
    }
    return this.repository
      .listAssignments(context.merchantId)
      .filter((assignment) => assignment.status === "queued")
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      );
  }

  claim(
    context: TenantContext,
    assignmentId: string,
    expectedLockVersion: number,
  ): ResearchAssignment {
    if (!context.actorId) throw new AssignmentTransitionError("actor_required");
    const result = this.repository.claimAssignment({
      assignmentId,
      merchantId: context.merchantId,
      researcherId: context.actorId,
      expectedLockVersion,
      claimedAt: this.clock.now(),
    });
    if (result.outcome === "expired")
      throw new AssignmentTransitionError("expired");
    if (result.outcome === "conflict") {
      throw new AssignmentTransitionError(
        result.assignment ? "conflict" : "not_found",
      );
    }
    return result.assignment;
  }

  startInterview(
    context: TenantContext,
    assignmentId: string,
    expectedLockVersion: number,
  ): InterviewHandoff {
    if (!context.actorId) throw new AssignmentTransitionError("actor_required");
    const assignment = this.repository.getAssignmentById(assignmentId);
    if (!assignment || assignment.merchantId !== context.merchantId) {
      throw new AssignmentTransitionError("not_found");
    }
    const handoff = interviewHandoffSchema.parse({
      id: this.ids.next(),
      merchantId: context.merchantId,
      researchAssignmentId: assignment.id,
      researcherId: context.actorId,
      scriptVersionId: assignment.scriptVersionId,
      researchFieldSetVersionId: assignment.researchFieldSetVersionId,
      startedAt: this.clock.now(),
      telephonyAction: "none",
    });
    const result = this.repository.startInterview({
      assignmentId,
      merchantId: context.merchantId,
      researcherId: context.actorId,
      expectedLockVersion,
      startedAt: handoff.startedAt,
      handoff,
    });
    if (result.outcome === "expired")
      throw new AssignmentTransitionError("expired");
    if (result.outcome === "conflict") {
      throw new AssignmentTransitionError(
        result.assignment ? "conflict" : "not_found",
      );
    }
    return handoff;
  }
}
