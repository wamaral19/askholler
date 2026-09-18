import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type HollerDatabase = NodePgDatabase<typeof schema>;

type JsonObject = Readonly<Record<string, unknown>>;

export function assertOperationalJobPayload(payload: JsonObject): void {
  const forbidden =
    /phone|email|name|address|transcript|recording|customerprivate|response|notes?|raw(?:_|)body|access(?:_|)token|signed(?:_|)url|encrypted/i;
  const visit = (value: unknown, path: string): void => {
    if (forbidden.test(path)) throw new Error("JOB_PAYLOAD_FORBIDDEN_KEY");
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value))
        visit(child, `${path}.${key}`);
    }
  };
  visit(payload, "payload");
}

export class PostgresCommerceRepository {
  constructor(private readonly db: HollerDatabase) {}

  async saveEventIfAbsent(input: typeof schema.commerceEvents.$inferInsert) {
    const [inserted] = await this.db
      .insert(schema.commerceEvents)
      .values(input)
      .onConflictDoNothing({
        target: [
          schema.commerceEvents.merchantId,
          schema.commerceEvents.source,
          schema.commerceEvents.sourceEventId,
        ],
      })
      .returning();
    if (inserted) return inserted;
    const [existing] = await this.db
      .select()
      .from(schema.commerceEvents)
      .where(
        and(
          eq(schema.commerceEvents.merchantId, input.merchantId),
          eq(schema.commerceEvents.source, input.source),
          eq(schema.commerceEvents.sourceEventId, input.sourceEventId),
        ),
      )
      .limit(1);
    if (!existing)
      throw new Error("Commerce event conflict could not be resolved");
    return existing;
  }

  async getEvent(merchantId: string, id: string) {
    const [event] = await this.db
      .select()
      .from(schema.commerceEvents)
      .where(
        and(
          eq(schema.commerceEvents.merchantId, merchantId),
          eq(schema.commerceEvents.id, id),
        ),
      )
      .limit(1);
    return event;
  }
}

export class PostgresResearchRepository {
  constructor(private readonly db: HollerDatabase) {}

  async saveEvaluationIfAbsent(
    input: typeof schema.qualificationEvaluations.$inferInsert,
  ) {
    const [inserted] = await this.db
      .insert(schema.qualificationEvaluations)
      .values(input)
      .onConflictDoNothing({
        target: [
          schema.qualificationEvaluations.commerceEventId,
          schema.qualificationEvaluations.researchMomentVersionId,
          schema.qualificationEvaluations.engineVersion,
        ],
      })
      .returning();
    if (inserted) return inserted;
    const [existing] = await this.db
      .select()
      .from(schema.qualificationEvaluations)
      .where(
        and(
          eq(schema.qualificationEvaluations.merchantId, input.merchantId),
          eq(
            schema.qualificationEvaluations.commerceEventId,
            input.commerceEventId,
          ),
          eq(
            schema.qualificationEvaluations.researchMomentVersionId,
            input.researchMomentVersionId,
          ),
          eq(
            schema.qualificationEvaluations.engineVersion,
            input.engineVersion,
          ),
        ),
      )
      .limit(1);
    if (!existing)
      throw new Error("Qualification conflict belongs to another tenant");
    return existing;
  }

  async saveAssignmentIfAbsent(
    input: typeof schema.researchAssignments.$inferInsert,
  ) {
    const [inserted] = await this.db
      .insert(schema.researchAssignments)
      .values(input)
      .onConflictDoNothing({
        target: [
          schema.researchAssignments.commerceEventId,
          schema.researchAssignments.researchMomentVersionId,
        ],
      })
      .returning();
    if (inserted) return inserted;
    return this.getAssignment(
      input.merchantId,
      input.commerceEventId,
      input.researchMomentVersionId,
    );
  }

  async getAssignment(
    merchantId: string,
    commerceEventId: string,
    momentVersionId: string,
  ) {
    const [row] = await this.db
      .select()
      .from(schema.researchAssignments)
      .where(
        and(
          eq(schema.researchAssignments.merchantId, merchantId),
          eq(schema.researchAssignments.commerceEventId, commerceEventId),
          eq(
            schema.researchAssignments.researchMomentVersionId,
            momentVersionId,
          ),
        ),
      )
      .limit(1);
    return row;
  }

  async listQueue(merchantId: string) {
    return this.db
      .select()
      .from(schema.researchAssignments)
      .where(
        and(
          eq(schema.researchAssignments.merchantId, merchantId),
          or(
            eq(schema.researchAssignments.status, "queued"),
            eq(schema.researchAssignments.status, "claimed"),
          ),
        ),
      )
      .orderBy(
        desc(schema.researchAssignments.priority),
        asc(schema.researchAssignments.createdAt),
      );
  }

  async claim(input: {
    merchantId: string;
    assignmentId: string;
    researcherId: string;
    expectedLockVersion: number;
    now: Date;
  }) {
    return this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(schema.researchAssignments)
        .set({
          status: "claimed",
          assignedResearcherId: input.researcherId,
          claimedAt: input.now,
          lockVersion: input.expectedLockVersion + 1,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.researchAssignments.id, input.assignmentId),
            eq(schema.researchAssignments.merchantId, input.merchantId),
            eq(schema.researchAssignments.status, "queued"),
            eq(
              schema.researchAssignments.lockVersion,
              input.expectedLockVersion,
            ),
            sql`${schema.researchAssignments.expiresAt} > ${input.now}`,
          ),
        )
        .returning();
      if (claimed)
        await tx.insert(schema.assignmentTransitions).values({
          id: randomUUID(),
          merchantId: input.merchantId,
          assignmentId: input.assignmentId,
          fromStatus: "queued",
          toStatus: "claimed",
          actorId: input.researcherId,
          occurredAt: input.now,
          lockVersion: input.expectedLockVersion + 1,
          metadata: {},
        });
      return claimed;
    });
  }

  async startInterview(input: {
    merchantId: string;
    assignmentId: string;
    researcherId: string;
    expectedLockVersion: number;
    interviewId: string;
    startedAt: Date;
  }) {
    return this.db.transaction(async (tx) => {
      const [assignment] = await tx
        .update(schema.researchAssignments)
        .set({
          status: "interview_started",
          interviewStartedAt: input.startedAt,
          lockVersion: input.expectedLockVersion + 1,
          updatedAt: input.startedAt,
        })
        .where(
          and(
            eq(schema.researchAssignments.id, input.assignmentId),
            eq(schema.researchAssignments.merchantId, input.merchantId),
            eq(schema.researchAssignments.status, "claimed"),
            eq(
              schema.researchAssignments.assignedResearcherId,
              input.researcherId,
            ),
            eq(
              schema.researchAssignments.lockVersion,
              input.expectedLockVersion,
            ),
            sql`${schema.researchAssignments.expiresAt} > ${input.startedAt}`,
          ),
        )
        .returning();
      if (!assignment) return undefined;
      await tx.insert(schema.assignmentTransitions).values({
        id: randomUUID(),
        merchantId: input.merchantId,
        assignmentId: input.assignmentId,
        fromStatus: "claimed",
        toStatus: "interview_started",
        actorId: input.researcherId,
        occurredAt: input.startedAt,
        lockVersion: input.expectedLockVersion + 1,
        metadata: { interviewId: input.interviewId },
      });
      const [interview] = await tx
        .insert(schema.interviews)
        .values({
          id: input.interviewId,
          merchantId: input.merchantId,
          researchAssignmentId: input.assignmentId,
          researcherId: input.researcherId,
          scriptVersionId: assignment.scriptVersionId,
          researchFieldSetVersionId: assignment.researchFieldSetVersionId,
          status: "in_progress",
          startedAt: input.startedAt,
        })
        .returning();
      return { assignment, interview };
    });
  }
}

export class PostgresEvidenceRepository {
  constructor(private readonly db: HollerDatabase) {}

  async saveTranscriptWithSegments(input: {
    transcript: typeof schema.transcripts.$inferInsert;
    segments: readonly (typeof schema.transcriptSegments.$inferInsert)[];
  }) {
    return this.db.transaction(async (tx) => {
      const [transcript] = await tx
        .insert(schema.transcripts)
        .values(input.transcript)
        .returning();
      if (
        input.segments.some(
          (segment) =>
            segment.merchantId !== input.transcript.merchantId ||
            segment.interviewId !== input.transcript.interviewId,
        )
      ) {
        throw new Error(
          "Transcript segments must belong to the same tenant and interview",
        );
      }
      if (input.segments.length)
        await tx.insert(schema.transcriptSegments).values([...input.segments]);
      return transcript;
    });
  }

  async saveAcceptedResponseWithEvidence(input: {
    response: typeof schema.interviewResponses.$inferInsert;
    evidence: readonly Omit<
      typeof schema.responseEvidence.$inferInsert,
      "responseId" | "merchantId"
    >[];
  }) {
    if (
      input.response.reviewStatus === "accepted" &&
      input.evidence.length === 0
    )
      throw new Error("Accepted responses require transcript evidence");
    return this.db.transaction(async (tx) => {
      const [response] = await tx
        .insert(schema.interviewResponses)
        .values(input.response)
        .returning();
      for (const evidence of input.evidence) {
        const [segment] = await tx
          .select({ text: schema.transcriptSegments.text })
          .from(schema.transcriptSegments)
          .where(
            and(
              eq(schema.transcriptSegments.id, evidence.transcriptSegmentId),
              eq(
                schema.transcriptSegments.merchantId,
                input.response.merchantId,
              ),
              eq(
                schema.transcriptSegments.interviewId,
                input.response.interviewId,
              ),
            ),
          )
          .limit(1);
        if (
          !segment ||
          evidence.startChar < 0 ||
          evidence.endChar <= evidence.startChar ||
          evidence.endChar > segment.text.length
        )
          throw new Error("Invalid or cross-tenant evidence span");
        await tx.insert(schema.responseEvidence).values({
          ...evidence,
          responseId: input.response.id,
          merchantId: input.response.merchantId,
        });
      }
      return response;
    });
  }

  async saveObservation(
    input: typeof schema.interviewObservations.$inferInsert,
  ) {
    const [interview] = await this.db
      .select({ id: schema.interviews.id })
      .from(schema.interviews)
      .where(
        and(
          eq(schema.interviews.id, input.interviewId),
          eq(schema.interviews.merchantId, input.merchantId),
        ),
      )
      .limit(1);
    if (!interview) throw new Error("Interview not found for tenant");
    const [row] = await this.db
      .insert(schema.interviewObservations)
      .values(input)
      .returning();
    return row;
  }
}

export class PostgresReportingRepository {
  constructor(private readonly db: HollerDatabase) {}

  async saveAngle(input: {
    angle: typeof schema.angles.$inferInsert;
    revision: typeof schema.angleRevisions.$inferInsert;
    evidence: readonly (typeof schema.angleEvidence.$inferInsert)[];
    metrics: readonly (typeof schema.angleMetrics.$inferInsert)[];
  }) {
    if (
      input.revision.merchantId !== input.angle.merchantId ||
      input.evidence.some((row) => row.merchantId !== input.angle.merchantId) ||
      input.metrics.some((row) => row.merchantId !== input.angle.merchantId)
    )
      throw new Error("Angle graph must belong to one tenant");
    return this.db.transaction(async (tx) => {
      await tx.insert(schema.angles).values(input.angle).onConflictDoNothing();
      const [revision] = await tx
        .insert(schema.angleRevisions)
        .values(input.revision)
        .onConflictDoNothing({
          target: [
            schema.angleRevisions.angleId,
            schema.angleRevisions.revision,
          ],
        })
        .returning();
      if (revision && input.evidence.length)
        await tx.insert(schema.angleEvidence).values([...input.evidence]);
      if (revision && input.metrics.length)
        await tx.insert(schema.angleMetrics).values([...input.metrics]);
      return revision;
    });
  }

  async saveReport(input: {
    report: typeof schema.reports.$inferInsert;
    revision: typeof schema.reportRevisions.$inferInsert;
    angles: readonly (typeof schema.reportAngles.$inferInsert)[];
  }) {
    if (input.revision.merchantId !== input.report.merchantId)
      throw new Error("Report graph must belong to one tenant");
    return this.db.transaction(async (tx) => {
      await tx
        .insert(schema.reports)
        .values(input.report)
        .onConflictDoNothing({
          target: [
            schema.reports.merchantId,
            schema.reports.periodStart,
            schema.reports.periodEnd,
          ],
        });
      const [revision] = await tx
        .insert(schema.reportRevisions)
        .values(input.revision)
        .onConflictDoNothing({
          target: [
            schema.reportRevisions.reportId,
            schema.reportRevisions.revision,
          ],
        })
        .returning();
      if (revision && input.angles.length)
        await tx.insert(schema.reportAngles).values([...input.angles]);
      return revision;
    });
  }

  async saveArtifactIfAbsent(
    input: typeof schema.reportArtifacts.$inferInsert,
  ) {
    const [inserted] = await this.db
      .insert(schema.reportArtifacts)
      .values(input)
      .onConflictDoNothing({
        target: [
          schema.reportArtifacts.merchantId,
          schema.reportArtifacts.reportRevisionId,
          schema.reportArtifacts.format,
          schema.reportArtifacts.contentSha256,
        ],
      })
      .returning();
    if (inserted) return inserted;
    const [existing] = await this.db
      .select()
      .from(schema.reportArtifacts)
      .where(
        and(
          eq(schema.reportArtifacts.merchantId, input.merchantId),
          eq(schema.reportArtifacts.reportRevisionId, input.reportRevisionId),
          eq(schema.reportArtifacts.format, input.format),
          eq(schema.reportArtifacts.contentSha256, input.contentSha256),
        ),
      )
      .limit(1);
    return existing;
  }
}

export class PostgresJobDispatcher {
  constructor(
    private readonly db: HollerDatabase,
    private readonly merchantId: string,
  ) {}

  async enqueue(input: {
    jobType: string;
    idempotencyKey: string;
    payload: Readonly<Record<string, string | number | boolean | null>>;
  }): Promise<void> {
    assertOperationalJobPayload(input.payload);
    const aggregateId = Object.values(input.payload).find(
      (value): value is string =>
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        ),
    );
    if (!aggregateId) throw new Error("JOB_PAYLOAD_MISSING_OPAQUE_ID");
    await this.db
      .insert(schema.outboxEvents)
      .values({
        id: randomUUID(),
        merchantId: this.merchantId,
        aggregateType: input.jobType,
        aggregateId,
        eventType: input.jobType,
        payload: input.payload,
        schemaVersion: 1,
        idempotencyKey: `job:${this.merchantId}:${input.jobType}:${input.idempotencyKey}`,
        correlationId: randomUUID(),
      })
      .onConflictDoNothing({
        target: schema.outboxEvents.idempotencyKey,
      });
  }
}

export class PostgresAuditRepository {
  constructor(private readonly db: HollerDatabase) {}
  async record(input: Omit<typeof schema.auditEvents.$inferInsert, "id">) {
    const [row] = await this.db
      .insert(schema.auditEvents)
      .values({ id: randomUUID(), ...input })
      .returning();
    return row;
  }
}
