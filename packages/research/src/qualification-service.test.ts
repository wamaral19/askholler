import type {
  Clock,
  CohortExpression,
  IdGenerator,
  TenantContext,
} from "@holler/domain";
import { describe, expect, it } from "vitest";
import { ResearchAssignmentQueue } from "./assignment-queue";
import { CohortExpressionEvaluator } from "./evaluator";
import { createInitialCohortPredicateRegistry } from "./predicates";
import { InMemoryQualificationRepository } from "./qualification-repository";
import { QualificationService } from "./qualification-service";
import type {
  NormalizedCommerceEventRecord,
  PublishedResearchMoment,
} from "./qualification-models";
import type {
  CohortQueryFact,
  CohortQueryRepository,
  CurrentCategoryReference,
  ResearchCohortQueryContext,
} from "./query-context";

const uuid = (suffix: number): string =>
  `01993f5e-7b6c-7000-8000-${String(suffix).padStart(12, "0")}`;

class MutableClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class SequenceIds implements IdGenerator {
  #next = 100;
  next(): string {
    return uuid(this.#next++);
  }
}

class FakeCohortQueryRepository implements CohortQueryRepository {
  sequence: CohortQueryFact<number> = { state: "known", value: 2 };
  current = new Set(["merchant:bottoms"]);
  first = new Set<string>();
  firstOverride?: CohortQueryFact<boolean>;

  async getCustomerOrderSequence(): Promise<CohortQueryFact<number>> {
    return this.sequence;
  }
  async currentOrderContainsCurrentCategory(
    _context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    return {
      state: "known",
      value: this.current.has(`${category.namespace}:${category.key}`),
    };
  }
  async firstOrderContainsCurrentCategory(
    _context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    return (
      this.firstOverride ?? {
        state: "known",
        value: this.first.has(`${category.namespace}:${category.key}`),
      }
    );
  }
}

const cohort: CohortExpression = {
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
        config: { categoryKey: "bottoms" },
      },
    },
    {
      predicate: "order.contains_current_category",
      version: 1,
      config: { categoryKey: "bottoms" },
    },
  ],
};

const event: NormalizedCommerceEventRecord = {
  id: uuid(1),
  correlationId: "qualification-test",
  event: {
    schemaVersion: 1,
    merchantId: uuid(2),
    source: "synthetic",
    sourceEventId: "synthetic-order-2",
    eventType: "order_completed",
    customerId: uuid(3),
    orderId: uuid(4),
    customerOrderSequence: 2,
    occurredAt: "2026-09-17T12:00:00.000Z",
    historyCompleteness: {
      state: "complete",
      historyStartAt: "2026-01-01T00:00:00.000Z",
      reason: "full_import",
    },
    catalogEnrichment: {
      state: "ready",
      refreshedAt: "2026-09-17T11:00:00.000Z",
    },
    observedAttribution: {
      schemaVersion: 1,
      readiness: "ready",
      source: "meta",
      channel: "paid_social",
      campaign: null,
      referringDomain: null,
      landingPath: null,
      utm: null,
      observedAt: "2026-09-17T12:00:00.000Z",
    },
  },
};

const moment: PublishedResearchMoment = {
  id: uuid(5),
  merchantId: uuid(2),
  eventType: "order_completed",
  status: "published",
  cohort,
  priority: 50,
  scriptVersionId: uuid(6),
  researchFieldSetVersionId: uuid(7),
  activeFrom: null,
  activeTo: null,
  assignmentTtlMs: 5 * 60_000,
};

function context(actor = 8): TenantContext {
  return {
    merchantId: uuid(2) as TenantContext["merchantId"],
    actorId: uuid(actor) as NonNullable<TenantContext["actorId"]>,
    correlationId: "qualification-test",
  };
}

function setup(queryRepository = new FakeCohortQueryRepository()): {
  clock: MutableClock;
  repository: InMemoryQualificationRepository;
  service: QualificationService;
  queue: ResearchAssignmentQueue;
} {
  const clock = new MutableClock(new Date("2026-09-17T12:00:01.000Z"));
  const repository = new InMemoryQualificationRepository();
  const ids = new SequenceIds();
  const evaluator = new CohortExpressionEvaluator(
    createInitialCohortPredicateRegistry(queryRepository),
  );
  return {
    clock,
    repository,
    service: new QualificationService(repository, evaluator, clock, ids),
    queue: new ResearchAssignmentQueue(repository, clock, ids),
  };
}

describe("QualificationService and ResearchAssignmentQueue", () => {
  it("persists one auditable evaluation and assignment across duplicate evaluation", async () => {
    const { repository, service, queue } = setup();
    const first = await service.evaluate(context(), event, moment);
    const duplicate = await service.evaluate(context(), event, moment);

    expect(first.evaluation).toMatchObject({
      outcome: "match",
      eligible: true,
    });
    expect(duplicate).toEqual(first);
    expect(repository.listAssignments(uuid(2))).toHaveLength(1);
    expect(queue.listActionable(context())).toEqual([first.assignment]);
    expect(repository.listInterviewHandoffs(uuid(2))).toHaveLength(0);
  });

  it("persists unknown history as fail-closed and creates no assignment", async () => {
    const queryRepository = new FakeCohortQueryRepository();
    queryRepository.firstOverride = {
      state: "unknown",
      reason: "history_incomplete",
    };
    const { repository, service } = setup(queryRepository);

    const result = await service.evaluate(context(), event, moment);

    expect(result.evaluation).toMatchObject({
      outcome: "unknown",
      eligible: false,
    });
    expect(result.evaluation.reasonCodes).toContain(
      "customer.first_order_contains_current_category.v1.history_incomplete",
    );
    expect(result.assignment).toBeUndefined();
    expect(repository.listAssignments(uuid(2))).toHaveLength(0);
  });

  it("allows one atomic claim and one explicit interview start under concurrency", async () => {
    const { repository, service, queue } = setup();
    const result = await service.evaluate(context(), event, moment);
    const assignment = result.assignment!;

    const claims = await Promise.allSettled([
      Promise.resolve().then(() => queue.claim(context(8), assignment.id, 0)),
      Promise.resolve().then(() => queue.claim(context(9), assignment.id, 0)),
    ]);
    expect(claims.filter((claim) => claim.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(claims.filter((claim) => claim.status === "rejected")).toHaveLength(
      1,
    );

    const claimed = repository.getAssignmentById(assignment.id)!;
    const winningActor =
      claimed.assignedResearcherId === uuid(8) ? context(8) : context(9);
    expect(repository.getInterviewHandoff(assignment.id)).toBeUndefined();

    const starts = await Promise.allSettled([
      Promise.resolve().then(() =>
        queue.startInterview(winningActor, assignment.id, 1),
      ),
      Promise.resolve().then(() =>
        queue.startInterview(winningActor, assignment.id, 1),
      ),
    ]);
    expect(starts.filter((start) => start.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(starts.filter((start) => start.status === "rejected")).toHaveLength(
      1,
    );
    const handoff = repository.getInterviewHandoff(assignment.id);
    expect(handoff).toMatchObject({
      telephonyAction: "none",
      researcherId: winningActor.actorId,
    });
    expect(repository.listInterviewHandoffs(uuid(2))).toHaveLength(1);
  });

  it("expires stale work and rejects invalid transitions", async () => {
    const { clock, repository, service, queue } = setup();
    const result = await service.evaluate(context(), event, moment);
    const assignment = result.assignment!;
    clock.advance(moment.assignmentTtlMs);

    expect(queue.listActionable(context())).toEqual([]);
    expect(repository.getAssignmentById(assignment.id)?.status).toBe("expired");
    expect(() => queue.claim(context(), assignment.id, 1)).toThrow("conflict");
    expect(() => queue.startInterview(context(), assignment.id, 1)).toThrow(
      "conflict",
    );
  });
});
