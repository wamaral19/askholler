import { randomUUID } from "node:crypto";

import {
  auditEvents,
  customers,
  merchants,
  orderLineItems,
  orders,
  type HollerDatabase,
} from "@holler/db";
import type { ObservedAttributionV1 } from "@holler/domain";
import { moneyToMinor, type HistoricalOrderV1 } from "@holler/shopify";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import {
  CSV_LINE_ITEM_PREFIX,
  customerIdFor,
  shopifyMerchantId,
  stableUuid,
} from "./shopify-ingestion.server";

export interface HistoricalImportResult {
  readonly merchantId: string;
  readonly ordersInserted: number;
  /** Already held, usually because a webhook delivered them first. */
  readonly ordersAlreadyPresent: number;
  readonly lineItemsInserted: number;
  readonly customersLinked: number;
  readonly firstOrderAt: string | null;
  readonly latestOrderAt: string | null;
}

const BATCH = 200;

/**
 * Writes historical orders from a merchant's CSV export. Unlike a webhook, an
 * import creates no commerce events or outbox jobs, so past orders never enter
 * the research queue, and it stores no contact details. Orders Holler already
 * holds are left as they are.
 *
 * With `fullHistory` (the export covers every order up to when the store's
 * webhooks began), every customer's history is marked complete and each
 * order's position in its customer's sequence is recomputed.
 */
export async function importShopifyHistoricalOrders(
  db: HollerDatabase,
  shopDomain: string,
  imported: readonly HistoricalOrderV1[],
  options: { fullHistory: boolean; now?: Date },
): Promise<HistoricalImportResult> {
  const now = options.now ?? new Date();
  const merchantId = shopifyMerchantId(shopDomain);
  await db
    .insert(merchants)
    .values({
      id: merchantId,
      shopDomain,
      name: shopDomain,
      timezone: "UTC",
      status: "active",
    })
    .onConflictDoNothing();

  let ordersInserted = 0;
  let lineItemsInserted = 0;
  const linkedCustomers = new Set<string>();
  for (let start = 0; start < imported.length; start += BATCH) {
    await db.transaction(async (tx) => {
      for (const order of imported.slice(start, start + BATCH)) {
        const customerId = order.customerId
          ? customerIdFor(merchantId, order.customerId)
          : null;
        if (customerId && order.customerId) {
          linkedCustomers.add(customerId);
          await tx
            .insert(customers)
            .values({
              id: customerId,
              merchantId,
              shopifyCustomerId: order.customerId,
              historyCompleteness: {
                state: "partial",
                historyStartAt: null,
                reason: "import_pending",
              },
            })
            .onConflictDoNothing({
              target: [customers.merchantId, customers.shopifyCustomerId],
            });
        }
        const orderId = stableUuid(`shopify-order:${merchantId}:${order.id}`);
        const [inserted] = await tx
          .insert(orders)
          .values({
            id: orderId,
            merchantId,
            customerId,
            shopifyOrderId: order.id,
            sourceOrderNumber: order.name,
            orderedAt: new Date(order.createdAt),
            // Any later webhook update is newer than the import.
            sourceUpdatedAt: new Date(order.createdAt),
            totalMinor: moneyToMinor(order.total, order.currency),
            currency: order.currency,
            financialStatus: order.financialStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            observedAttribution: unavailableAttribution(order.createdAt),
          })
          .onConflictDoNothing({
            target: [orders.merchantId, orders.shopifyOrderId],
          })
          .returning({ id: orders.id });
        if (!inserted) continue;
        ordersInserted++;
        for (const [index, line] of order.lineItems.entries()) {
          const shopifyLineItemId = `${CSV_LINE_ITEM_PREFIX}${index + 1}`;
          await tx.insert(orderLineItems).values({
            id: stableUuid(
              `shopify-line:${merchantId}:${order.id}:${shopifyLineItemId}`,
            ),
            merchantId,
            orderId,
            shopifyLineItemId,
            productId: null,
            sku: line.sku,
            title: line.title,
            quantity: line.quantity,
            unitPriceMinor: moneyToMinor(line.unitPrice, order.currency),
            discountMinor: moneyToMinor(line.discount, order.currency),
            currency: order.currency,
          });
          lineItemsInserted++;
        }
      }
    });
  }

  await refreshAllCustomerTotals(db, merchantId, now);
  if (options.fullHistory) await markHistoryComplete(db, merchantId, now);

  const dates = imported.map((order) => order.createdAt).sort();
  const result: HistoricalImportResult = {
    merchantId,
    ordersInserted,
    ordersAlreadyPresent: imported.length - ordersInserted,
    lineItemsInserted,
    customersLinked: linkedCustomers.size,
    firstOrderAt: dates[0] ?? null,
    latestOrderAt: dates.at(-1) ?? null,
  };
  // Coverage record: what was imported and whether history is now complete.
  await db.insert(auditEvents).values({
    id: randomUUID(),
    merchantId,
    actorId: null,
    action: "shopify.csv_import_completed",
    subjectType: "merchant",
    subjectId: merchantId,
    metadata: { ...result, fullHistory: options.fullHistory },
    occurredAt: now,
  });
  return result;
}

function unavailableAttribution(observedAt: string): ObservedAttributionV1 {
  return {
    schemaVersion: 1,
    readiness: "unavailable",
    source: null,
    channel: null,
    campaign: null,
    referringDomain: null,
    landingPath: null,
    utm: null,
    observedAt,
  };
}

/** Set-based version of the per-customer refresh in ingestion. */
async function refreshAllCustomerTotals(
  db: HollerDatabase,
  merchantId: string,
  now: Date,
): Promise<void> {
  // Lifetime revenue only sums orders in the customer's latest currency.
  await db.execute(sql`
    with stats as (
      select customer_id,
        count(*)::int as order_count,
        min(ordered_at) as first_order_at,
        max(ordered_at) as latest_order_at,
        (array_agg(currency order by ordered_at desc))[1] as latest_currency
      from orders
      where merchant_id = ${merchantId} and customer_id is not null
      group by customer_id
    ), revenue as (
      select o.customer_id, sum(o.total_minor) as total
      from orders o join stats s
        on s.customer_id = o.customer_id and o.currency = s.latest_currency
      where o.merchant_id = ${merchantId}
      group by o.customer_id
    )
    update customers c set
      order_count = s.order_count,
      lifetime_revenue_minor = coalesce(r.total, 0),
      currency = s.latest_currency,
      first_order_at = s.first_order_at,
      latest_order_at = s.latest_order_at,
      updated_at = ${now}
    from stats s left join revenue r on r.customer_id = s.customer_id
    where c.merchant_id = ${merchantId} and c.id = s.customer_id
  `);
}

async function markHistoryComplete(
  db: HollerDatabase,
  merchantId: string,
  now: Date,
): Promise<void> {
  await db
    .update(customers)
    .set({
      historyCompleteness: {
        state: "complete",
        historyStartAt: null,
        reason: "full_import",
      },
      updatedAt: now,
    })
    .where(
      and(
        eq(customers.merchantId, merchantId),
        isNotNull(customers.shopifyCustomerId),
      ),
    );
  await db.execute(sql`
    with sequence as (
      select id, row_number() over (
        partition by customer_id order by ordered_at, id
      )::int as position
      from orders
      where merchant_id = ${merchantId} and customer_id is not null
    )
    update orders o set customer_order_sequence = sequence.position,
      updated_at = ${now}
    from sequence
    where o.merchant_id = ${merchantId} and o.id = sequence.id
  `);
}
