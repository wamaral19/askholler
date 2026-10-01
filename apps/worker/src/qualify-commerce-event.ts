import { randomUUID } from "node:crypto";

import {
  commerceEvents,
  customers,
  qualificationEvaluations,
  researchAssignments,
  researchMomentVersions,
  researchMoments,
  type HollerDatabase,
} from "@holler/db";
import {
  CohortExpressionEvaluator,
  createInitialCohortPredicateRegistry,
  type CohortEvaluationResult,
} from "@holler/research";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import { PostgresCohortQueryRepository } from "./cohort-query-repository";
import { SafeJobError, type EvaluateCommerceEventPayload } from "./jobs";

export const ENGINE_VERSION = "cohort-v1";
const ASSIGNMENT_TTL_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Evaluates one commerce event against the latest published version of every
 * active research moment. Evaluations and assignments are unique per
 * (event, moment version), so Graphile retries are replay-safe.
 */
export async function qualifyCommerceEvent(
  db: HollerDatabase,
  payload: EvaluateCommerceEventPayload,
  now = new Date(),
): Promise<void> {
  const [event] = await db
    .select()
    .from(commerceEvents)
    .where(
      and(
        eq(commerceEvents.merchantId, payload.merchantId),
        eq(commerceEvents.id, payload.commerceEventId),
      ),
    );
  if (!event) throw new SafeJobError("COMMERCE_EVENT_NOT_FOUND", false);

  const moments = await db
    .selectDistinctOn([researchMomentVersions.researchMomentId])
    .from(researchMomentVersions)
    .innerJoin(
      researchMoments,
      and(
        eq(researchMoments.id, researchMomentVersions.researchMomentId),
        eq(researchMoments.merchantId, researchMomentVersions.merchantId),
      ),
    )
    .where(
      and(
        eq(researchMomentVersions.merchantId, event.merchantId),
        eq(researchMoments.status, "active"),
        isNotNull(researchMomentVersions.publishedAt),
      ),
    )
    .orderBy(
      researchMomentVersions.researchMomentId,
      desc(researchMomentVersions.version),
    );

  // Only customers with a stored, encrypted phone who have not opted out can
  // be called; everyone else is evaluated and audited but never queued.
  const [contact] = event.customerId
    ? await db
        .select({ status: customers.contactabilityStatus })
        .from(customers)
        .where(
          and(
            eq(customers.merchantId, event.merchantId),
            eq(customers.id, event.customerId),
            isNull(customers.deletedAt),
          ),
        )
    : [];
  const contactable = contact?.status === "eligible";

  const evaluator = new CohortExpressionEvaluator(
    createInitialCohortPredicateRegistry(new PostgresCohortQueryRepository(db)),
  );

  for (const { research_moment_versions: moment } of moments) {
    const active =
      moment.eventType === event.eventType &&
      (moment.activeFrom === null || event.occurredAt >= moment.activeFrom) &&
      (moment.activeTo === null || event.occurredAt < moment.activeTo);
    let result: CohortEvaluationResult;
    let reasonCodes: string[];
    if (!active) {
      result = { outcome: "no_match", eligible: false, unknownReasons: [] };
      reasonCodes = ["moment.inactive_or_event_type_mismatch"];
    } else {
      try {
        result = await evaluator.evaluate(moment.cohortExpression as never, {
          merchantId: event.merchantId,
          commerceEventId: event.id,
          occurredAt: event.occurredAt,
          correlationId: event.correlationId,
        });
        // Unknown facts only explain an unknown outcome; a definite no_match
        // can coexist with unknown siblings that did not decide it.
        reasonCodes =
          result.outcome === "unknown"
            ? result.unknownReasons.map((reason) => reason.reason)
            : [`cohort.${result.outcome}`];
      } catch {
        // A stored expression the registry rejects will never succeed on retry.
        result = { outcome: "unknown", eligible: false, unknownReasons: [] };
        reasonCodes = ["cohort.expression_unsupported"];
      }
    }

    await db.transaction(async (tx) => {
      // Serialize allocation per moment so the weekly cap holds. The cap
      // spans versions: editing a run's script must not reset its count.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${moment.researchMomentId}))`,
      );
      const weeklyCap = weeklyCapOf(moment.allocationPolicy);
      let allocated = result.eligible;
      if (allocated && !contactable) {
        allocated = false;
        reasonCodes = [...reasonCodes, "contact.not_contactable"];
      }
      if (allocated && weeklyCap !== null) {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(researchAssignments)
          .where(
            and(
              eq(researchAssignments.merchantId, event.merchantId),
              inArray(
                researchAssignments.researchMomentVersionId,
                tx
                  .select({ id: researchMomentVersions.id })
                  .from(researchMomentVersions)
                  .where(
                    eq(
                      researchMomentVersions.researchMomentId,
                      moment.researchMomentId,
                    ),
                  ),
              ),
              gte(
                researchAssignments.createdAt,
                new Date(now.getTime() - WEEK_MS),
              ),
            ),
          );
        if ((row?.count ?? 0) >= weeklyCap) {
          allocated = false;
          reasonCodes = [...reasonCodes, "allocation.weekly_cap_reached"];
        }
      }

      const [inserted] = await tx
        .insert(qualificationEvaluations)
        .values({
          id: randomUUID(),
          merchantId: event.merchantId,
          commerceEventId: event.id,
          researchMomentVersionId: moment.id,
          engineVersion: ENGINE_VERSION,
          outcome: result.outcome,
          reasonCodes,
          inputSnapshot: {
            schemaVersion: 1,
            attributes: event.attributes,
            unknownReasons: result.unknownReasons,
            allocated,
          },
          evaluatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            qualificationEvaluations.commerceEventId,
            qualificationEvaluations.researchMomentVersionId,
            qualificationEvaluations.engineVersion,
          ],
        })
        .returning({ id: qualificationEvaluations.id });
      // An existing evaluation means a prior attempt already committed.
      if (!inserted || !allocated) return;

      const expiresAt = new Date(
        event.occurredAt.getTime() + ASSIGNMENT_TTL_MS,
      );
      await tx
        .insert(researchAssignments)
        .values({
          id: randomUUID(),
          merchantId: event.merchantId,
          researchMomentVersionId: moment.id,
          qualificationEvaluationId: inserted.id,
          commerceEventId: event.id,
          customerId: event.customerId,
          orderId: event.orderId,
          scriptVersionId: moment.scriptVersionId,
          researchFieldSetVersionId: moment.researchFieldSetVersionId,
          priority: moment.priority,
          status: expiresAt <= now ? "expired" : "queued",
          expiresAt,
        })
        .onConflictDoNothing({
          target: [
            researchAssignments.commerceEventId,
            researchAssignments.researchMomentVersionId,
          ],
        });
    });
  }
}

function weeklyCapOf(policy: unknown): number | null {
  const cap = (policy as { weeklyCap?: unknown } | null)?.weeklyCap;
  return typeof cap === "number" && Number.isInteger(cap) && cap >= 0
    ? cap
    : null;
}
