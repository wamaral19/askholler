import type {
  CohortPredicate,
  ParameterizedPredicateQuery,
  PredicateEvaluation,
  PredicateQueryScope,
  QualificationContext,
} from "@holler/domain";
import { CohortPredicateRegistry } from "@holler/domain";
import { z } from "zod";
import type {
  CohortQueryFact,
  CohortQueryRepository,
  CurrentCategoryReference,
  ResearchCohortQueryContext,
} from "./query-context";

const orderSequenceConfigSchema = z
  .object({
    operator: z.enum(["equals", "at_least", "at_most"]),
    value: z.number().int().positive(),
  })
  .strict();

const currentCategoryConfigSchema = z
  .object({
    categoryKey: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    namespace: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9._-]*$/)
      .default("merchant"),
  })
  .strict();

export type OrderSequenceConfig = z.infer<typeof orderSequenceConfigSchema>;
export type CurrentCategoryConfig = z.infer<typeof currentCategoryConfigSchema>;

function asResearchContext(
  context: QualificationContext,
): ResearchCohortQueryContext {
  const candidate = context as Partial<ResearchCohortQueryContext>;
  if (!candidate.correlationId) {
    throw new Error(
      "Research cohort evaluation requires a server-derived correlationId",
    );
  }
  return context as ResearchCohortQueryContext;
}

function unknownEvaluation(
  fact: Extract<CohortQueryFact<unknown>, { state: "unknown" }>,
  predicate: string,
  version: number,
): PredicateEvaluation {
  return {
    outcome: "unknown",
    reasonCode: `${predicate}.v${version}.${fact.reason}`,
  };
}

function categoryReference(
  config: CurrentCategoryConfig,
): CurrentCategoryReference {
  return { namespace: config.namespace, key: config.categoryKey };
}

class CustomerOrderSequencePredicate implements CohortPredicate<OrderSequenceConfig> {
  readonly key = "customer.order_sequence";
  readonly version = 1;
  readonly configSchema = orderSequenceConfigSchema;

  constructor(private readonly repository: CohortQueryRepository) {}

  async evaluate(
    context: QualificationContext,
    config: OrderSequenceConfig,
  ): Promise<PredicateEvaluation> {
    const fact = await this.repository.getCustomerOrderSequence(
      asResearchContext(context),
    );
    if (fact.state === "unknown")
      return unknownEvaluation(fact, this.key, this.version);

    let matched: boolean;
    switch (config.operator) {
      case "equals":
        matched = fact.value === config.value;
        break;
      case "at_least":
        matched = fact.value >= config.value;
        break;
      case "at_most":
        matched = fact.value <= config.value;
        break;
    }
    return {
      outcome: matched ? "match" : "no_match",
      reasonCode: `${this.key}.v${this.version}.${matched ? "matched" : "not_matched"}`,
    };
  }

  compileQuery(
    scope: PredicateQueryScope,
    config: OrderSequenceConfig,
  ): ParameterizedPredicateQuery {
    const operator = { equals: "=", at_least: ">=", at_most: "<=" }[
      config.operator
    ];
    return {
      text: `SELECT (o.customer_order_sequence ${operator} $3) AS matched FROM commerce_events ce JOIN orders o ON o.merchant_id = ce.merchant_id AND o.id = ce.order_id WHERE ce.merchant_id = $1 AND ce.id = $2`,
      parameters: [scope.merchantId, scope.commerceEventId, config.value],
    };
  }

  describe(config: OrderSequenceConfig): string {
    const operator = {
      equals: "equals",
      at_least: "is at least",
      at_most: "is at most",
    }[config.operator];
    return `Customer order sequence ${operator} ${config.value}`;
  }
}

abstract class CurrentCategoryPredicate implements CohortPredicate<CurrentCategoryConfig> {
  abstract readonly key: string;
  readonly version = 1;
  readonly configSchema = currentCategoryConfigSchema;

  constructor(protected readonly repository: CohortQueryRepository) {}

  abstract evaluate(
    context: QualificationContext,
    config: CurrentCategoryConfig,
  ): Promise<PredicateEvaluation>;

  abstract describe(config: CurrentCategoryConfig): string;

  abstract compileQuery(
    scope: PredicateQueryScope,
    config: CurrentCategoryConfig,
  ): ParameterizedPredicateQuery;

  protected result(fact: CohortQueryFact<boolean>): PredicateEvaluation {
    if (fact.state === "unknown")
      return unknownEvaluation(fact, this.key, this.version);
    return {
      outcome: fact.value ? "match" : "no_match",
      reasonCode: `${this.key}.v${this.version}.${fact.value ? "matched" : "not_matched"}`,
    };
  }
}

class OrderContainsCurrentCategoryPredicate extends CurrentCategoryPredicate {
  readonly key = "order.contains_current_category";

  async evaluate(
    context: QualificationContext,
    config: CurrentCategoryConfig,
  ): Promise<PredicateEvaluation> {
    return this.result(
      await this.repository.currentOrderContainsCurrentCategory(
        asResearchContext(context),
        categoryReference(config),
      ),
    );
  }

  compileQuery(
    scope: PredicateQueryScope,
    config: CurrentCategoryConfig,
  ): ParameterizedPredicateQuery {
    return {
      text: `SELECT EXISTS (SELECT 1 FROM commerce_events ce JOIN order_line_items oli ON oli.merchant_id = ce.merchant_id AND oli.order_id = ce.order_id JOIN product_category_assignments pca ON pca.merchant_id = oli.merchant_id AND pca.product_id = oli.product_id JOIN product_categories pc ON pc.merchant_id = pca.merchant_id AND pc.id = pca.category_id WHERE ce.merchant_id = $1 AND ce.id = $2 AND pc.source = $3 AND pc.key = $4) AS matched`,
      parameters: [
        scope.merchantId,
        scope.commerceEventId,
        config.namespace,
        config.categoryKey,
      ],
    };
  }

  describe(config: CurrentCategoryConfig): string {
    return `Current order contains current category ${config.namespace}:${config.categoryKey}`;
  }
}

class FirstOrderContainsCurrentCategoryPredicate extends CurrentCategoryPredicate {
  readonly key = "customer.first_order_contains_current_category";

  async evaluate(
    context: QualificationContext,
    config: CurrentCategoryConfig,
  ): Promise<PredicateEvaluation> {
    return this.result(
      await this.repository.firstOrderContainsCurrentCategory(
        asResearchContext(context),
        categoryReference(config),
      ),
    );
  }

  compileQuery(
    scope: PredicateQueryScope,
    config: CurrentCategoryConfig,
  ): ParameterizedPredicateQuery {
    return {
      text: `SELECT EXISTS (SELECT 1 FROM commerce_events ce JOIN orders current_order ON current_order.merchant_id = ce.merchant_id AND current_order.id = ce.order_id JOIN orders first_order ON first_order.merchant_id = current_order.merchant_id AND first_order.customer_id = current_order.customer_id AND first_order.customer_order_sequence = 1 JOIN order_line_items oli ON oli.merchant_id = first_order.merchant_id AND oli.order_id = first_order.id JOIN product_category_assignments pca ON pca.merchant_id = oli.merchant_id AND pca.product_id = oli.product_id JOIN product_categories pc ON pc.merchant_id = pca.merchant_id AND pc.id = pca.category_id WHERE ce.merchant_id = $1 AND ce.id = $2 AND pc.source = $3 AND pc.key = $4) AS matched`,
      parameters: [
        scope.merchantId,
        scope.commerceEventId,
        config.namespace,
        config.categoryKey,
      ],
    };
  }

  describe(config: CurrentCategoryConfig): string {
    return `Customer first order contains current category ${config.namespace}:${config.categoryKey}`;
  }
}

export function createInitialCohortPredicateRegistry(
  repository: CohortQueryRepository,
): CohortPredicateRegistry {
  const registry = new CohortPredicateRegistry();
  registry.register(new CustomerOrderSequencePredicate(repository));
  registry.register(new OrderContainsCurrentCategoryPredicate(repository));
  registry.register(new FirstOrderContainsCurrentCategoryPredicate(repository));
  return registry;
}
