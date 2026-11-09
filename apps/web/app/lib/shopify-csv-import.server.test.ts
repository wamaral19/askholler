import { createHash, createHmac } from "node:crypto";

import {
  mapShopifyOrderWebhook,
  type HistoricalOrderV1,
} from "@holler/shopify";
import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { importShopifyHistoricalOrders } from "./shopify-csv-import.server";
import {
  applyShopifyOrderUpdate,
  shopifyMerchantId,
} from "./shopify-ingestion.server";

const databaseUrl = testDatabaseUrl();
const shop = "holler-csv-test.myshopify.com";
const storeShop = "holler-store-hook-test.myshopify.com";
const merchantId = shopifyMerchantId(shop);

function historical(
  order: number,
  customer: number | null,
  createdAt: string,
): HistoricalOrderV1 {
  return {
    id: `gid://shopify/Order/${order}`,
    name: `#${order}`,
    createdAt,
    cancelledAt: null,
    financialStatus: "paid",
    fulfillmentStatus: null,
    currency: "USD",
    total: "20.00",
    customerId: customer ? `gid://shopify/Customer/${customer}` : null,
    lineItems: [
      {
        title: "Travel kit",
        sku: "KIT-1",
        quantity: 2,
        unitPrice: "10.00",
        discount: "0",
      },
    ],
  };
}

function webhookPayload(order: number, createdAt: string) {
  return {
    admin_graphql_api_id: `gid://shopify/Order/${order}`,
    name: `#${order}`,
    created_at: createdAt,
    updated_at: "2026-11-01T00:00:00Z",
    currency: "USD",
    total_price: "20.00",
    financial_status: "partially_refunded",
    customer: null,
    line_items: [
      {
        admin_graphql_api_id: `gid://shopify/LineItem/${order}1`,
        product_id: null,
        variant_id: null,
        sku: "KIT-1",
        title: "Travel kit",
        quantity: 2,
        price: "10.00",
      },
    ],
  };
}

describe.skipIf(databaseUrl === undefined)(
  "Shopify CSV history import and store webhooks",
  () => {
    let isolated: IsolatedTestDatabase;
    const count = async (query: ReturnType<typeof sql>) =>
      Number((await isolated.db.execute(query)).rows[0]?.count ?? 0);

    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(databaseUrl!);
    }, 30_000);
    afterAll(async () => isolated?.close(), 30_000);

    it("imports history without queuing research, and converges on re-import", async () => {
      const orders = [
        historical(9101, 501, "2024-01-10T10:00:00.000Z"),
        historical(9102, 501, "2024-02-10T10:00:00.000Z"),
        historical(9103, 502, "2024-03-10T10:00:00.000Z"),
        historical(9104, null, "2024-04-10T10:00:00.000Z"),
      ];
      const first = await importShopifyHistoricalOrders(
        isolated.db,
        shop,
        orders,
        { fullHistory: true },
      );
      expect(first).toMatchObject({
        ordersInserted: 4,
        ordersAlreadyPresent: 0,
        lineItemsInserted: 4,
        customersLinked: 2,
      });
      const again = await importShopifyHistoricalOrders(
        isolated.db,
        shop,
        orders,
        { fullHistory: true },
      );
      expect(again).toMatchObject({
        ordersInserted: 0,
        ordersAlreadyPresent: 4,
      });

      expect(
        await count(
          sql`select count(*) from commerce_events where merchant_id = ${merchantId}`,
        ),
      ).toBe(0);
      expect(
        await count(
          sql`select count(*) from outbox_events where merchant_id = ${merchantId}`,
        ),
      ).toBe(0);
      expect(
        await count(
          sql`select count(*) from customer_private where merchant_id = ${merchantId}`,
        ),
      ).toBe(0);

      const repeat = await isolated.db.execute(sql`
        select order_count, lifetime_revenue_minor, history_completeness->>'state' as state
        from customers where merchant_id = ${merchantId}
          and shopify_customer_id = 'gid://shopify/Customer/501'`);
      expect(repeat.rows[0]).toEqual({
        order_count: 2,
        lifetime_revenue_minor: "4000",
        state: "complete",
      });
      const sequence = await isolated.db.execute(sql`
        select source_order_number, customer_order_sequence from orders
        where merchant_id = ${merchantId} order by ordered_at`);
      expect(sequence.rows.map((row) => row.customer_order_sequence)).toEqual([
        1,
        2,
        1,
        null,
      ]);
    });

    it("replaces imported lines when Shopify later sends the order's update", async () => {
      const update = mapShopifyOrderWebhook({
        webhookId: "00000000-0000-4000-8000-000000009101",
        eventId: null,
        shopDomain: shop,
        apiVersion: "2026-10",
        triggeredAt: "2026-11-01T00:00:00Z",
        payload: webhookPayload(9101, "2024-01-10T10:00:00Z"),
      });
      await expect(
        applyShopifyOrderUpdate(isolated.db, update, "sha"),
      ).resolves.toMatchObject({ outcome: "updated" });
      const lines = await isolated.db.execute(sql`
        select l.shopify_line_item_id from order_line_items l
        join orders o on o.id = l.order_id
        where o.merchant_id = ${merchantId}
          and o.shopify_order_id = 'gid://shopify/Order/9101'`);
      expect(lines.rows).toEqual([
        { shopify_line_item_id: "gid://shopify/LineItem/91011" },
      ]);
    });

    it("ingests a store webhook signed with that store's key and rejects others", async () => {
      // The route opens its own handle from DATABASE_URL; fresh modules make it
      // open one to the isolated database.
      vi.stubEnv("DATABASE_URL", isolated.databaseUrl);
      vi.stubEnv(
        "SHOPIFY_STORE_WEBHOOK_KEYS",
        JSON.stringify({ [storeShop]: "store-signing-key" }),
      );
      vi.resetModules();
      const ingestion = await import("./shopify-ingestion.server");
      const { action } = await import("../routes/shopify-store-webhooks");

      const body = JSON.stringify(
        webhookPayload(9201, new Date().toISOString()),
      );
      const deliver = (key: string, shopDomain = storeShop) =>
        action({
          request: new Request("https://app.test/webhooks/store", {
            method: "POST",
            headers: {
              "X-Shopify-Topic": "orders/create",
              "X-Shopify-Shop-Domain": shopDomain,
              "X-Shopify-Webhook-Id": "not-a-uuid-delivery-1",
              "X-Shopify-Hmac-Sha256": createHmac("sha256", key)
                .update(body)
                .digest("base64"),
            },
            body,
          }),
          params: {},
          context: {},
        } as never);

      expect((await deliver("wrong-key")).status).toBe(401);
      expect((await deliver("store-signing-key", shop)).status).toBe(401);
      expect((await deliver("store-signing-key")).status).toBe(200);
      expect((await deliver("store-signing-key")).status).toBe(200);

      const storeMerchant = shopifyMerchantId(storeShop);
      expect(
        await count(sql`select count(*) from merchants
          where id = ${storeMerchant} and installed_at is not null`),
      ).toBe(1);
      expect(
        await count(
          sql`select count(*) from orders where merchant_id = ${storeMerchant}`,
        ),
      ).toBe(1);
      expect(
        await count(sql`select count(*) from webhook_receipts
          where merchant_id = ${storeMerchant}
            and body_sha256 = ${createHash("sha256").update(body).digest("hex")}`),
      ).toBe(1);
      // Release the route's connections so the isolated database can be dropped.
      await (
        ingestion.getShopifyIngestionDatabase() as unknown as {
          $client: { end(): Promise<void> };
        }
      ).$client.end();
      vi.unstubAllEnvs();
    });
  },
);
