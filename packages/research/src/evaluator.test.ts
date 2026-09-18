import type { CohortExpression } from "@holler/domain";
import { describe, expect, it } from "vitest";
import { CohortExpressionEvaluator } from "./evaluator";
import { createInitialCohortPredicateRegistry } from "./predicates";
import type {
  CohortQueryFact,
  CohortQueryRepository,
  CurrentCategoryReference,
  ResearchCohortQueryContext,
} from "./query-context";

const context: ResearchCohortQueryContext = {
  merchantId: "01993f5e-7b6c-7000-8000-000000000001",
  commerceEventId: "01993f5e-7b6c-7000-8000-000000000002",
  occurredAt: new Date("2026-09-17T12:00:00.000Z"),
  correlationId: "test-correlation",
};

const known = <T>(value: T): CohortQueryFact<T> => ({ state: "known", value });

class FakeCohortRepository implements CohortQueryRepository {
  sequence: CohortQueryFact<number> = known(2);
  currentOrderCategories = new Set(["merchant:bottoms"]);
  firstOrderCategories = new Set<string>();
  firstOrderOverride?: CohortQueryFact<boolean>;

  async getCustomerOrderSequence(): Promise<CohortQueryFact<number>> {
    return this.sequence;
  }

  async currentOrderContainsCurrentCategory(
    _context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    return known(
      this.currentOrderCategories.has(`${category.namespace}:${category.key}`),
    );
  }

  async firstOrderContainsCurrentCategory(
    _context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    return (
      this.firstOrderOverride ??
      known(
        this.firstOrderCategories.has(`${category.namespace}:${category.key}`),
      )
    );
  }
}

function setup(repository = new FakeCohortRepository()): {
  repository: FakeCohortRepository;
  evaluator: CohortExpressionEvaluator;
} {
  return {
    repository,
    evaluator: new CohortExpressionEvaluator(
      createInitialCohortPredicateRegistry(repository),
    ),
  };
}

const secondOrderCategoryTransition: CohortExpression = {
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

describe("CohortExpressionEvaluator", () => {
  it("matches the second-order transition into a current category", async () => {
    const { evaluator } = setup();

    await expect(
      evaluator.evaluate(secondOrderCategoryTransition, context),
    ).resolves.toEqual({
      outcome: "match",
      eligible: true,
      unknownReasons: [],
    });
  });

  it("fails closed as unknown when first-order history is incomplete", async () => {
    const repository = new FakeCohortRepository();
    repository.firstOrderOverride = {
      state: "unknown",
      reason: "history_incomplete",
    };
    const { evaluator } = setup(repository);

    await expect(
      evaluator.evaluate(secondOrderCategoryTransition, context),
    ).resolves.toEqual({
      outcome: "unknown",
      eligible: false,
      unknownReasons: [
        {
          predicate: "customer.first_order_contains_current_category",
          version: 1,
          reason:
            "customer.first_order_contains_current_category.v1.history_incomplete",
        },
      ],
    });
  });

  it("uses three-valued all, any, and not semantics", async () => {
    const repository = new FakeCohortRepository();
    repository.sequence = {
      state: "unknown",
      reason: "order_sequence_unavailable",
    };
    const { evaluator } = setup(repository);
    const unknownSequence: CohortExpression = {
      predicate: "customer.order_sequence",
      version: 1,
      config: { operator: "equals", value: 2 },
    };
    const currentHasBottoms: CohortExpression = {
      predicate: "order.contains_current_category",
      version: 1,
      config: { categoryKey: "bottoms" },
    };
    const currentHasTops: CohortExpression = {
      predicate: "order.contains_current_category",
      version: 1,
      config: { categoryKey: "tops" },
    };

    await expect(
      evaluator.evaluate({ all: [unknownSequence, currentHasTops] }, context),
    ).resolves.toMatchObject({ outcome: "no_match", eligible: false });
    await expect(
      evaluator.evaluate(
        { any: [unknownSequence, currentHasBottoms] },
        context,
      ),
    ).resolves.toMatchObject({ outcome: "match", eligible: true });
    await expect(
      evaluator.evaluate({ not: unknownSequence }, context),
    ).resolves.toMatchObject({
      outcome: "unknown",
      eligible: false,
    });
    await expect(
      evaluator.evaluate({ not: currentHasBottoms }, context),
    ).resolves.toMatchObject({
      outcome: "no_match",
      eligible: false,
    });
  });

  it("rejects an unknown code-registered predicate", async () => {
    const { evaluator } = setup();
    const expression: CohortExpression = {
      predicate: "merchant.unregistered_logic",
      version: 1,
      config: {},
    };

    await expect(evaluator.evaluate(expression, context)).rejects.toThrow(
      "Unknown cohort predicate: merchant.unregistered_logic@1",
    );
  });
});
