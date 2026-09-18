import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "./index";

const databaseUrl = testDatabaseUrl();
const merchantA = "00000000-0000-7000-8000-0000000000a1";
const merchantB = "00000000-0000-7000-8000-0000000000b1";
const customerA = "00000000-0000-7000-8000-0000000000a2";

describe.skipIf(databaseUrl === undefined)(
  "tenant integrity constraints",
  () => {
    let isolated: IsolatedTestDatabase;

    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(databaseUrl!);
      await isolated.db.execute(sql`
      insert into merchants (id, name, timezone, status)
      values (${merchantA}, 'Synthetic A', 'UTC', 'active'),
             (${merchantB}, 'Synthetic B', 'UTC', 'active')
    `);
      await isolated.db.execute(sql`
      insert into customers (id, merchant_id, history_completeness)
      values (${customerA}, ${merchantA}, '{}'::jsonb)
    `);
    }, 30_000);

    afterAll(async () => isolated?.close());

    it("rejects a customer-private row forged into another merchant", async () => {
      await expect(
        isolated.db.execute(sql`
        insert into customer_private (customer_id, merchant_id, key_version)
        values (${customerA}, ${merchantB}, 'synthetic-v1')
      `),
      ).rejects.toThrow();
    });

    it("rejects an order linked to another merchant's customer", async () => {
      await expect(
        isolated.db.execute(sql`
        insert into orders (
          id, merchant_id, customer_id, shopify_order_id, ordered_at,
          source_updated_at, total_minor, currency, observed_attribution
        ) values (
          '00000000-0000-7000-8000-0000000000b2', ${merchantB}, ${customerA},
          'synthetic-order', now(), now(), 1000, 'USD', '{}'::jsonb
        )
      `),
      ).rejects.toThrow();
    });
  },
);
