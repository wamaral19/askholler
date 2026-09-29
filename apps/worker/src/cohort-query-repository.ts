import type { HollerDatabase } from "@holler/db";
import type {
  CohortQueryFact,
  CohortQueryRepository,
  CurrentCategoryReference,
  ResearchCohortQueryContext,
} from "@holler/research";
import { sql } from "drizzle-orm";

interface EventOrderRow {
  customer_id: string | null;
  order_id: string | null;
  customer_order_sequence: number | null;
  history_state: string | null;
}

/**
 * Read-only cohort facts scoped by merchant and commerce event. Missing
 * history or catalog enrichment is reported as unknown so qualification
 * fails closed rather than guessing.
 */
export class PostgresCohortQueryRepository implements CohortQueryRepository {
  constructor(private readonly db: HollerDatabase) {}

  async getCustomerOrderSequence(
    context: ResearchCohortQueryContext,
  ): Promise<CohortQueryFact<number>> {
    const row = await this.eventOrder(context);
    if (!row?.order_id) return unknown("order_unavailable");
    if (!row.customer_id) return unknown("customer_unavailable");
    if (row.customer_order_sequence === null)
      return unknown(
        row.history_state === "complete"
          ? "order_sequence_unavailable"
          : "history_incomplete",
      );
    return { state: "known", value: row.customer_order_sequence };
  }

  async currentOrderContainsCurrentCategory(
    context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    const row = await this.eventOrder(context);
    if (!row?.order_id) return unknown("order_unavailable");
    return this.orderContainsCategory(context, row.order_id, category);
  }

  async firstOrderContainsCurrentCategory(
    context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    const row = await this.eventOrder(context);
    if (!row?.order_id) return unknown("order_unavailable");
    if (!row.customer_id) return unknown("customer_unavailable");
    if (row.history_state !== "complete") return unknown("history_incomplete");
    const result = await this.db.execute(sql`
      select id from orders
      where merchant_id = ${context.merchantId}
        and customer_id = ${row.customer_id}
        and customer_order_sequence = 1
      limit 1
    `);
    const first = result.rows[0] as { id: string } | undefined;
    if (!first) return unknown("first_order_unavailable");
    return this.orderContainsCategory(context, first.id, category);
  }

  private async eventOrder(
    context: ResearchCohortQueryContext,
  ): Promise<EventOrderRow | undefined> {
    const result = await this.db.execute(sql`
      select ce.customer_id, o.id as order_id, o.customer_order_sequence,
        c.history_completeness->>'state' as history_state
      from commerce_events ce
      left join orders o on o.merchant_id = ce.merchant_id and o.id = ce.order_id
      left join customers c on c.merchant_id = ce.merchant_id and c.id = ce.customer_id
      where ce.merchant_id = ${context.merchantId}
        and ce.id = ${context.commerceEventId}
    `);
    return result.rows[0] as EventOrderRow | undefined;
  }

  /** A match on any enriched line wins; otherwise unenriched lines make it unknown. */
  private async orderContainsCategory(
    context: ResearchCohortQueryContext,
    orderId: string,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    const result = await this.db.execute(sql`
      select
        bool_or(pc.id is not null) as matched,
        bool_or(p.id is null or p.catalog_enrichment_state <> 'ready') as incomplete
      from order_line_items oli
      left join products p on p.merchant_id = oli.merchant_id and p.id = oli.product_id
      left join product_category_assignments pca
        on pca.merchant_id = oli.merchant_id and pca.product_id = oli.product_id
      left join product_categories pc
        on pc.merchant_id = pca.merchant_id and pc.id = pca.category_id
        and pc.source = ${category.namespace} and pc.key = ${category.key}
      where oli.merchant_id = ${context.merchantId} and oli.order_id = ${orderId}
    `);
    const row = result.rows[0] as
      { matched: boolean | null; incomplete: boolean | null } | undefined;
    if (row?.matched) return { state: "known", value: true };
    if (row?.incomplete) return unknown("catalog_enrichment_incomplete");
    return { state: "known", value: false };
  }
}

function unknown<T>(
  reason: Extract<CohortQueryFact<T>, { state: "unknown" }>["reason"],
): CohortQueryFact<T> {
  return { state: "unknown", reason };
}
