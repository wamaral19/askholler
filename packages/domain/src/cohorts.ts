import { z } from "zod";

export const predicateReferenceSchema = z.object({
  predicate: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  version: z.number().int().positive(),
  config: z.record(z.string(), z.unknown()),
});

export type PredicateReference = z.infer<typeof predicateReferenceSchema>;

export type CohortExpression =
  | PredicateReference
  | { all: CohortExpression[] }
  | { any: CohortExpression[] }
  | { not: CohortExpression };

export const cohortExpressionSchema: z.ZodType<CohortExpression> = z.lazy(() =>
  z.union([
    predicateReferenceSchema,
    z.object({ all: z.array(cohortExpressionSchema).min(1) }),
    z.object({ any: z.array(cohortExpressionSchema).min(1) }),
    z.object({ not: cohortExpressionSchema }),
  ]),
);

export interface ParameterizedPredicateQuery {
  readonly text: string;
  readonly parameters: readonly unknown[];
}

export interface PredicateQueryScope {
  readonly merchantId: string;
  readonly commerceEventId: string;
}

export type PredicateEvaluation =
  | { readonly outcome: "match"; readonly reasonCode: string }
  | { readonly outcome: "no_match"; readonly reasonCode: string }
  | { readonly outcome: "unknown"; readonly reasonCode: string };

export interface QualificationContext {
  readonly merchantId: string;
  readonly commerceEventId: string;
  readonly occurredAt: Date;
}

export interface CohortPredicate<TConfig = unknown> {
  readonly key: string;
  readonly version: number;
  readonly configSchema: z.ZodType<TConfig>;
  evaluate(
    context: QualificationContext,
    config: TConfig,
  ): Promise<PredicateEvaluation>;
  compileQuery(
    scope: PredicateQueryScope,
    config: TConfig,
  ): ParameterizedPredicateQuery;
  describe(config: TConfig): string;
}

export class CohortPredicateRegistry {
  readonly #predicates = new Map<string, CohortPredicate>();

  register(predicate: CohortPredicate): void {
    const identity = `${predicate.key}@${predicate.version}`;
    if (this.#predicates.has(identity))
      throw new Error(`Cohort predicate already registered: ${identity}`);
    this.#predicates.set(identity, predicate);
  }

  resolve(reference: PredicateReference): CohortPredicate {
    const identity = `${reference.predicate}@${reference.version}`;
    const predicate = this.#predicates.get(identity);
    if (!predicate) throw new Error(`Unknown cohort predicate: ${identity}`);
    return predicate;
  }
}
