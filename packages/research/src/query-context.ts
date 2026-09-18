import type { QualificationContext } from "@holler/domain";

export type CohortQueryUnknownReason =
  | "customer_unavailable"
  | "order_unavailable"
  | "order_sequence_unavailable"
  | "history_incomplete"
  | "first_order_unavailable"
  | "catalog_enrichment_incomplete";

export type CohortQueryFact<T> =
  | {
      readonly state: "known";
      readonly value: T;
    }
  | {
      readonly state: "unknown";
      readonly reason: CohortQueryUnknownReason;
    };

/**
 * Server-derived context for qualification queries. Implementations must scope
 * every lookup by both merchantId and commerceEventId.
 */
export interface ResearchCohortQueryContext extends QualificationContext {
  readonly correlationId: string;
}

export interface CurrentCategoryReference {
  readonly namespace: string;
  readonly key: string;
}

/**
 * Read-only qualification projection. This package intentionally owns no SQL
 * or database implementation.
 */
export interface CohortQueryRepository {
  getCustomerOrderSequence(
    context: ResearchCohortQueryContext,
  ): Promise<CohortQueryFact<number>>;

  currentOrderContainsCurrentCategory(
    context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>>;

  firstOrderContainsCurrentCategory(
    context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>>;
}
