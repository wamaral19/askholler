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

  async currentOrderContainsSku(
    context: ResearchCohortQueryContext,
    sku: string,
  ): Promise<CohortQueryFact<boolean>> {
    return this.currentOrderContainsLineValue(context, "sku", sku);
  }

  async currentOrderContainsSize(
    context: ResearchCohortQueryContext,
    size: string,
  ): Promise<CohortQueryFact<boolean>> {
    return this.currentOrderContainsLineValue(context, "variant_title", size);
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

  async priorOrdersContainCurrentCategory(
    context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<boolean>> {
    const row = await this.eventOrder(context);
    if (!row?.order_id) return unknown("order_unavailable");
    if (!row.customer_id) return unknown("customer_unavailable");
    if (row.history_state !== "complete") return unknown("history_incomplete");
    const result = await this.db.execute(sql`
      select prior.id from orders prior
      join orders current_order
        on current_order.merchant_id = prior.merchant_id
        and current_order.id = ${row.order_id}
      where prior.merchant_id = ${context.merchantId}
        and prior.customer_id = ${row.customer_id}
        and prior.id <> current_order.id
        and prior.ordered_at < current_order.ordered_at
    `);
    const prior = result.rows as { id: string }[];
    if (!prior.length) return { state: "known", value: false };
    let incomplete = false;
    for (const order of prior) {
      const fact = await this.orderContainsCategory(
        context,
        order.id,
        category,
      );
      if (fact.state === "known" && fact.value) return fact;
      if (fact.state === "unknown") incomplete = true;
    }
    return incomplete
      ? unknown("catalog_enrichment_incomplete")
      : { state: "known", value: false };
  }

  async distinctOrdersWithProductTitles(
    context: ResearchCohortQueryContext,
    productTitles: readonly string[],
  ): Promise<CohortQueryFact<number>> {
    const row = await this.eventOrder(context);
    if (!row?.order_id) return unknown("order_unavailable");
    if (!row.customer_id) return unknown("customer_unavailable");
    if (row.history_state !== "complete") return unknown("history_incomplete");

    const result = await this.db.execute(sql`
      select
        count(distinct o.id) filter (
          where lower(oli.title) in (${sql.join(
            productTitles.map((title) => sql`lower(${title})`),
            sql`, `,
          )})
            and oli.quantity > oli.refunded_quantity
            and o.financial_status in ('paid', 'authorized', 'partially_paid', 'partially_refunded')
        )::int as order_count,
        bool_or(o.financial_status is null) as status_incomplete
      from orders o
      left join order_line_items oli
        on oli.merchant_id = o.merchant_id and oli.order_id = o.id
      where o.merchant_id = ${context.merchantId}
        and o.customer_id = ${row.customer_id}
    `);
    const count = result.rows[0] as
      | { order_count?: number | string; status_incomplete?: boolean }
      | undefined;
    if (count?.status_incomplete) return unknown("order_status_unavailable");
    return { state: "known", value: Number(count?.order_count ?? 0) };
  }

  async distinctOrdersWithCategory(
    context: ResearchCohortQueryContext,
    category: CurrentCategoryReference,
  ): Promise<CohortQueryFact<number>> {
    const row = await this.eventOrder(context);
    if (!row?.order_id) return unknown("order_unavailable");
    if (!row.customer_id) return unknown("customer_unavailable");
    if (row.history_state !== "complete") return unknown("history_incomplete");

    const result = await this.db.execute(sql`
      select
        count(distinct o.id) filter (
          where pc.id is not null
            and oli.quantity > oli.refunded_quantity
            and o.financial_status in ('paid', 'authorized', 'partially_paid', 'partially_refunded')
        )::int as order_count,
        bool_or(o.financial_status is null) as status_incomplete,
        bool_or(
          oli.quantity > oli.refunded_quantity
          and o.financial_status in ('paid', 'authorized', 'partially_paid', 'partially_refunded')
          and (p.id is null or p.catalog_enrichment_state <> 'ready')
        ) as catalog_incomplete
      from orders o
      left join order_line_items oli
        on oli.merchant_id = o.merchant_id and oli.order_id = o.id
      left join products p
        on p.merchant_id = oli.merchant_id and p.id = oli.product_id
      left join product_category_assignments pca
        on pca.merchant_id = oli.merchant_id and pca.product_id = oli.product_id
      left join product_categories pc
        on pc.merchant_id = pca.merchant_id and pc.id = pca.category_id
        and pc.source = ${category.namespace} and pc.key = ${category.key}
      where o.merchant_id = ${context.merchantId}
        and o.customer_id = ${row.customer_id}
    `);
    const count = result.rows[0] as
      | {
          order_count?: number | string;
          status_incomplete?: boolean;
          catalog_incomplete?: boolean;
        }
      | undefined;
    if (count?.status_incomplete) return unknown("order_status_unavailable");
    if (count?.catalog_incomplete)
      return unknown("catalog_enrichment_incomplete");
    return { state: "known", value: Number(count?.order_count ?? 0) };
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

  private async currentOrderContainsLineValue(
    context: ResearchCohortQueryContext,
    column: "sku" | "variant_title",
    value: string,
  ): Promise<CohortQueryFact<boolean>> {
    const row = await this.eventOrder(context);
    if (!row?.order_id) return unknown("order_unavailable");
    const result =
      column === "sku"
        ? await this.db.execute(sql`
            select exists (
              select 1 from order_line_items
              where merchant_id = ${context.merchantId}
                and order_id = ${row.order_id}
                and lower(sku) = lower(${value})
            ) as matched
          `)
        : await this.db.execute(sql`
            select exists (
              select 1 from order_line_items oli
              cross join lateral unnest(string_to_array(oli.variant_title, ' / ')) option_value
              where oli.merchant_id = ${context.merchantId}
                and oli.order_id = ${row.order_id}
                and lower(trim(option_value)) = lower(${value})
            ) as matched
          `);
    const matched = (result.rows[0] as { matched?: boolean } | undefined)
      ?.matched;
    return { state: "known", value: matched === true };
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
