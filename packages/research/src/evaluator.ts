import {
  cohortExpressionSchema,
  type CohortExpression,
  type CohortPredicateRegistry,
  type PredicateReference,
} from "@holler/domain";
import { InvalidCohortPredicateConfigError } from "./errors";
import type { ResearchCohortQueryContext } from "./query-context";

export type CohortEvaluationOutcome = "match" | "no_match" | "unknown";

export interface CohortUnknownReason {
  readonly predicate: string;
  readonly version: number;
  readonly reason: string;
}

export interface CohortEvaluationResult {
  readonly outcome: CohortEvaluationOutcome;
  /** Unknown is fail-closed for assignment creation. */
  readonly eligible: boolean;
  readonly unknownReasons: readonly CohortUnknownReason[];
}

interface ExpressionResult {
  readonly outcome: CohortEvaluationOutcome;
  readonly unknownReasons: readonly CohortUnknownReason[];
}

function isPredicateReference(
  expression: CohortExpression,
): expression is PredicateReference {
  return "predicate" in expression;
}

function combineAll(results: readonly ExpressionResult[]): ExpressionResult {
  const unknownReasons = results.flatMap((result) => result.unknownReasons);
  if (results.some((result) => result.outcome === "no_match")) {
    return { outcome: "no_match", unknownReasons };
  }
  if (results.some((result) => result.outcome === "unknown")) {
    return { outcome: "unknown", unknownReasons };
  }
  return { outcome: "match", unknownReasons };
}

function combineAny(results: readonly ExpressionResult[]): ExpressionResult {
  const unknownReasons = results.flatMap((result) => result.unknownReasons);
  if (results.some((result) => result.outcome === "match")) {
    return { outcome: "match", unknownReasons };
  }
  if (results.some((result) => result.outcome === "unknown")) {
    return { outcome: "unknown", unknownReasons };
  }
  return { outcome: "no_match", unknownReasons };
}

export class CohortExpressionEvaluator {
  constructor(private readonly registry: CohortPredicateRegistry) {}

  async evaluate(
    expressionInput: CohortExpression,
    context: ResearchCohortQueryContext,
  ): Promise<CohortEvaluationResult> {
    const expression = cohortExpressionSchema.parse(expressionInput);
    const result = await this.evaluateNode(expression, context);
    return {
      outcome: result.outcome,
      eligible: result.outcome === "match",
      unknownReasons: result.unknownReasons,
    };
  }

  private async evaluateNode(
    expression: CohortExpression,
    context: ResearchCohortQueryContext,
  ): Promise<ExpressionResult> {
    if (isPredicateReference(expression))
      return this.evaluatePredicate(expression, context);

    if ("all" in expression) {
      return combineAll(
        await Promise.all(
          expression.all.map((child) => this.evaluateNode(child, context)),
        ),
      );
    }

    if ("any" in expression) {
      return combineAny(
        await Promise.all(
          expression.any.map((child) => this.evaluateNode(child, context)),
        ),
      );
    }

    const child = await this.evaluateNode(expression.not, context);
    return {
      outcome:
        child.outcome === "unknown"
          ? "unknown"
          : child.outcome === "match"
            ? "no_match"
            : "match",
      unknownReasons: child.unknownReasons,
    };
  }

  private async evaluatePredicate(
    reference: PredicateReference,
    context: ResearchCohortQueryContext,
  ): Promise<ExpressionResult> {
    const predicate = this.registry.resolve(reference);
    const parsedConfig = predicate.configSchema.safeParse(reference.config);
    if (!parsedConfig.success) {
      throw new InvalidCohortPredicateConfigError(
        reference.predicate,
        reference.version,
        parsedConfig.error.issues.map((issue) => issue.message),
      );
    }

    const evaluation = await predicate.evaluate(context, parsedConfig.data);
    if (evaluation.outcome !== "unknown") {
      return { outcome: evaluation.outcome, unknownReasons: [] };
    }
    return {
      outcome: "unknown",
      unknownReasons: [
        {
          predicate: reference.predicate,
          version: reference.version,
          reason: evaluation.reasonCode,
        },
      ],
    };
  }
}
