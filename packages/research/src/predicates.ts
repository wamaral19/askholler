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

const countComparisonSchema = z.object({
  operator: z.enum(["equals", "at_least", "at_most"]),
  value: z.number().int().nonnegative(),
});

const productOrderCountConfigSchema = z
  .union([
    countComparisonSchema
      .extend({
        productTitles: z
          .array(z.string().trim().min(1).max(200))
          .min(1)
          .max(50),
      })
      .strict(),
    // Read previously saved single-product studies without migration.
    countComparisonSchema
      .extend({ productTitle: z.string().trim().min(1).max(200) })
      .strict(),
  ])
  .transform((config) => ({
    operator: config.operator,
    value: config.value,
    productTitles:
      "productTitles" in config ? config.productTitles : [config.productTitle],
  }));

const categoryOrderCountConfigSchema = countComparisonSchema
  .extend({
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

type LineValueConfig = { readonly sku?: string; readonly size?: string };

const lineValueConfigSchema = (key: "sku" | "size") =>
  z
    .object({
      [key]: z.string().trim().min(1).max(160),
    })
    .strict() as z.ZodType<LineValueConfig>;

export type OrderSequenceConfig = z.infer<typeof orderSequenceConfigSchema>;
export type CurrentCategoryConfig = z.infer<typeof currentCategoryConfigSchema>;
type CountComparison = z.infer<typeof countComparisonSchema>;
type ProductOrderCountConfig = z.infer<typeof productOrderCountConfigSchema>;
type CategoryOrderCountConfig = z.infer<typeof categoryOrderCountConfigSchema>;

function compareCount(value: number, config: CountComparison): boolean {
  switch (config.operator) {
    case "equals":
      return value === config.value;
    case "at_least":
      return value >= config.value;
    case "at_most":
      return value <= config.value;
  }
}

function countOperator(operator: CountComparison["operator"]): string {
  return { equals: "=", at_least: ">=", at_most: "<=" }[operator];
}

abstract class HistoricalOrderCountPredicate<
  TConfig extends CountComparison,
> implements CohortPredicate<TConfig> {
  abstract readonly key: string;
  readonly version = 1;
  abstract readonly configSchema: z.ZodType<TConfig>;

  constructor(protected readonly repository: CohortQueryRepository) {}

  protected result(
    fact: CohortQueryFact<number>,
    config: TConfig,
  ): PredicateEvaluation {
    if (fact.state === "unknown")
      return unknownEvaluation(fact, this.key, this.version);
    const matched = compareCount(fact.value, config);
    return {
      outcome: matched ? "match" : "no_match",
      reasonCode: `${this.key}.v${this.version}.${matched ? "matched" : "not_matched"}`,
    };
  }

  abstract evaluate(
    context: QualificationContext,
    config: TConfig,
  ): Promise<PredicateEvaluation>;

  abstract compileQuery(
    scope: PredicateQueryScope,
    config: TConfig,
  ): ParameterizedPredicateQuery;

  abstract describe(config: TConfig): string;
}

class ProductOrderCountPredicate extends HistoricalOrderCountPredicate<ProductOrderCountConfig> {
  readonly key = "customer.distinct_orders_with_product";
  readonly configSchema = productOrderCountConfigSchema;

  async evaluate(
    context: QualificationContext,
    config: ProductOrderCountConfig,
  ) {
    return this.result(
      await this.repository.distinctOrdersWithProductTitles(
        asResearchContext(context),
        config.productTitles,
      ),
      config,
    );
  }

  compileQuery(
    scope: PredicateQueryScope,
    config: ProductOrderCountConfig,
  ): ParameterizedPredicateQuery {
    return {
      text: `SELECT (count(distinct o.id) ${countOperator(config.operator)} $4) AS matched FROM commerce_events ce JOIN orders current_order ON current_order.merchant_id = ce.merchant_id AND current_order.id = ce.order_id JOIN orders o ON o.merchant_id = current_order.merchant_id AND o.customer_id = current_order.customer_id JOIN order_line_items oli ON oli.merchant_id = o.merchant_id AND oli.order_id = o.id WHERE ce.merchant_id = $1 AND ce.id = $2 AND lower(oli.title) = ANY($3) AND oli.quantity > oli.refunded_quantity AND o.financial_status IN ('paid', 'authorized', 'partially_paid', 'partially_refunded')`,
      parameters: [
        scope.merchantId,
        scope.commerceEventId,
        config.productTitles.map((title) => title.toLowerCase()),
        config.value,
      ],
    };
  }

  describe(config: ProductOrderCountConfig): string {
    const relation = {
      equals: "equals",
      at_least: "is at least",
      at_most: "is at most",
    }[config.operator];
    return `Distinct kept orders containing any of ${config.productTitles.join(", ")} ${relation} ${config.value}`;
  }
}

class CategoryOrderCountPredicate extends HistoricalOrderCountPredicate<CategoryOrderCountConfig> {
  readonly key = "customer.distinct_orders_with_category";
  readonly configSchema = categoryOrderCountConfigSchema;

  async evaluate(
    context: QualificationContext,
    config: CategoryOrderCountConfig,
  ) {
    return this.result(
      await this.repository.distinctOrdersWithCategory(
        asResearchContext(context),
        { namespace: config.namespace, key: config.categoryKey },
      ),
      config,
    );
  }

  compileQuery(
    scope: PredicateQueryScope,
    config: CategoryOrderCountConfig,
  ): ParameterizedPredicateQuery {
    return {
      text: `SELECT (count(distinct o.id) ${countOperator(config.operator)} $5) AS matched FROM commerce_events ce JOIN orders current_order ON current_order.merchant_id = ce.merchant_id AND current_order.id = ce.order_id JOIN orders o ON o.merchant_id = current_order.merchant_id AND o.customer_id = current_order.customer_id JOIN order_line_items oli ON oli.merchant_id = o.merchant_id AND oli.order_id = o.id JOIN product_category_assignments pca ON pca.merchant_id = oli.merchant_id AND pca.product_id = oli.product_id JOIN product_categories pc ON pc.merchant_id = pca.merchant_id AND pc.id = pca.category_id WHERE ce.merchant_id = $1 AND ce.id = $2 AND pc.source = $3 AND pc.key = $4 AND oli.quantity > oli.refunded_quantity AND o.financial_status IN ('paid', 'authorized', 'partially_paid', 'partially_refunded')`,
      parameters: [
        scope.merchantId,
        scope.commerceEventId,
        config.namespace,
        config.categoryKey,
        config.value,
      ],
    };
  }

  describe(config: CategoryOrderCountConfig): string {
    const relation = {
      equals: "equals",
      at_least: "is at least",
      at_most: "is at most",
    }[config.operator];
    return `Distinct kept orders in ${config.namespace}:${config.categoryKey} ${relation} ${config.value}`;
  }
}

class CurrentOrderLineValuePredicate implements CohortPredicate<LineValueConfig> {
  readonly version = 1;
  readonly configSchema: z.ZodType<LineValueConfig>;

  constructor(
    readonly key: "order.contains_sku" | "order.contains_size",
    private readonly repository: CohortQueryRepository,
  ) {
    this.configSchema = lineValueConfigSchema(
      key === "order.contains_sku" ? "sku" : "size",
    );
  }

  async evaluate(
    context: QualificationContext,
    config: LineValueConfig,
  ): Promise<PredicateEvaluation> {
    const fact =
      this.key === "order.contains_sku"
        ? await this.repository.currentOrderContainsSku(
            asResearchContext(context),
            config.sku!,
          )
        : await this.repository.currentOrderContainsSize(
            asResearchContext(context),
            config.size!,
          );
    if (fact.state === "unknown")
      return unknownEvaluation(fact, this.key, this.version);
    return {
      outcome: fact.value ? "match" : "no_match",
      reasonCode: `${this.key}.v1.${fact.value ? "matched" : "not_matched"}`,
    };
  }

  compileQuery(
    scope: PredicateQueryScope,
    config: LineValueConfig,
  ): ParameterizedPredicateQuery {
    const value =
      this.key === "order.contains_sku" ? config.sku! : config.size!;
    return {
      text:
        this.key === "order.contains_sku"
          ? "SELECT EXISTS (SELECT 1 FROM commerce_events ce JOIN order_line_items oli ON oli.merchant_id = ce.merchant_id AND oli.order_id = ce.order_id WHERE ce.merchant_id = $1 AND ce.id = $2 AND lower(oli.sku) = lower($3)) AS matched"
          : "SELECT EXISTS (SELECT 1 FROM commerce_events ce JOIN order_line_items oli ON oli.merchant_id = ce.merchant_id AND oli.order_id = ce.order_id CROSS JOIN LATERAL unnest(string_to_array(oli.variant_title, ' / ')) option_value WHERE ce.merchant_id = $1 AND ce.id = $2 AND lower(trim(option_value)) = lower($3)) AS matched",
      parameters: [scope.merchantId, scope.commerceEventId, value],
    };
  }

  describe(config: LineValueConfig): string {
    return this.key === "order.contains_sku"
      ? `Current order contains SKU ${config.sku}`
      : `Current order contains size ${config.size}`;
  }
}

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

class PriorOrdersContainCurrentCategoryPredicate extends CurrentCategoryPredicate {
  readonly key = "customer.prior_orders_contain_current_category";

  async evaluate(
    context: QualificationContext,
    config: CurrentCategoryConfig,
  ): Promise<PredicateEvaluation> {
    return this.result(
      await this.repository.priorOrdersContainCurrentCategory(
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
      text: `SELECT EXISTS (SELECT 1 FROM commerce_events ce JOIN orders current_order ON current_order.merchant_id = ce.merchant_id AND current_order.id = ce.order_id JOIN orders prior_order ON prior_order.merchant_id = current_order.merchant_id AND prior_order.customer_id = current_order.customer_id AND prior_order.id <> current_order.id AND prior_order.ordered_at < current_order.ordered_at JOIN order_line_items oli ON oli.merchant_id = prior_order.merchant_id AND oli.order_id = prior_order.id JOIN product_category_assignments pca ON pca.merchant_id = oli.merchant_id AND pca.product_id = oli.product_id JOIN product_categories pc ON pc.merchant_id = pca.merchant_id AND pc.id = pca.category_id WHERE ce.merchant_id = $1 AND ce.id = $2 AND pc.source = $3 AND pc.key = $4) AS matched`,
      parameters: [
        scope.merchantId,
        scope.commerceEventId,
        config.namespace,
        config.categoryKey,
      ],
    };
  }

  describe(config: CurrentCategoryConfig): string {
    return `Customer previously ordered current category ${config.namespace}:${config.categoryKey}`;
  }
}

export function createInitialCohortPredicateRegistry(
  repository: CohortQueryRepository,
): CohortPredicateRegistry {
  const registry = new CohortPredicateRegistry();
  registry.register(new CustomerOrderSequencePredicate(repository));
  registry.register(new OrderContainsCurrentCategoryPredicate(repository));
  registry.register(new FirstOrderContainsCurrentCategoryPredicate(repository));
  registry.register(new PriorOrdersContainCurrentCategoryPredicate(repository));
  registry.register(new ProductOrderCountPredicate(repository));
  registry.register(new CategoryOrderCountPredicate(repository));
  registry.register(
    new CurrentOrderLineValuePredicate("order.contains_sku", repository),
  );
  registry.register(
    new CurrentOrderLineValuePredicate("order.contains_size", repository),
  );
  return registry;
}
