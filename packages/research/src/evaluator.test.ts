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
  currentOrderSkus = new Set(["BUCK-NVY-M"]);
  currentOrderSizes = new Set(["Medium"]);
  firstOrderCategories = new Set<string>();
  firstOrderOverride?: CohortQueryFact<boolean>;
  productOrderCounts = new Map<string, CohortQueryFact<number>>();
  categoryOrderCounts = new Map<string, CohortQueryFact<number>>();

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
  async currentOrderContainsSku(
    _context: ResearchCohortQueryContext,
    sku: string,
  ): Promise<CohortQueryFact<boolean>> {
    return known(this.currentOrderSkus.has(sku));
  }
  async currentOrderContainsSize(
    _context: ResearchCohortQueryContext,
    size: string,
  ): Promise<CohortQueryFact<boolean>> {
    return known(this.currentOrderSizes.has(size));
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
  async priorOrdersContainCurrentCategory(
    context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    return this.firstOrderContainsCurrentCategory(context, category);
  }
  async distinctOrdersWithProductTitles(
    _context: ResearchCohortQueryContext,
    productTitles: readonly string[],
  ): Promise<CohortQueryFact<number>> {
    return (
      productTitles
        .map((title) => this.productOrderCounts.get(title))
        .find((fact) => fact?.state === "unknown") ??
      known(
        Math.max(
          0,
          ...productTitles.map((title) => {
            const fact = this.productOrderCounts.get(title);
            return fact?.state === "known" ? fact.value : 0;
          }),
        ),
      )
    );
  }
  async distinctOrdersWithCategory(
    _context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<number>> {
    return (
      this.categoryOrderCounts.get(`${category.namespace}:${category.key}`) ??
      known(0)
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
  it("matches current-order SKU and size predicates", async () => {
    const { evaluator } = setup();

    await expect(
      evaluator.evaluate(
        {
          all: [
            {
              predicate: "order.contains_sku",
              version: 1,
              config: { sku: "BUCK-NVY-M" },
            },
            {
              predicate: "order.contains_size",
              version: 1,
              config: { size: "Medium" },
            },
          ],
        },
        context,
      ),
    ).resolves.toMatchObject({ outcome: "match", eligible: true });
  });

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

  it("qualifies distinct kept product/category history including a zero-order exclusion", async () => {
    const repository = new FakeCohortRepository();
    repository.sequence = known(3);
    repository.productOrderCounts.set("Buckaroos", known(2));
    repository.categoryOrderCounts.set("merchant:bottoms", known(3));
    repository.categoryOrderCounts.set("merchant:tops", known(0));
    const { evaluator } = setup(repository);
    const expression: CohortExpression = {
      all: [
        {
          predicate: "customer.order_sequence",
          version: 1,
          config: { operator: "at_least", value: 2 },
        },
        {
          predicate: "customer.distinct_orders_with_product",
          version: 1,
          config: {
            productTitles: ["Buckaroos", "Weekend Joggers"],
            operator: "at_least",
            value: 1,
          },
        },
        {
          predicate: "customer.distinct_orders_with_category",
          version: 1,
          config: {
            namespace: "merchant",
            categoryKey: "bottoms",
            operator: "at_least",
            value: 1,
          },
        },
        {
          predicate: "customer.distinct_orders_with_category",
          version: 1,
          config: {
            namespace: "merchant",
            categoryKey: "tops",
            operator: "equals",
            value: 0,
          },
        },
      ],
    };

    await expect(
      evaluator.evaluate(expression, context),
    ).resolves.toMatchObject({ outcome: "match", eligible: true });

    repository.categoryOrderCounts.set("merchant:tops", known(1));
    await expect(
      evaluator.evaluate(expression, context),
    ).resolves.toMatchObject({ outcome: "no_match", eligible: false });
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
