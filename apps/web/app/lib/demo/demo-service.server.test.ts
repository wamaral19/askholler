import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";

import { repeatLeader } from "../analytics";
import type { TenantContext } from "../operations-types";
import {
  PostgresOperationsApplicationService,
  PrefixedSyntheticPhoneDecryptor,
} from "../postgres-operations-service.server";
import type { DemoConfig } from "./catalog";
import {
  DEMO_MERCHANT_ID,
  addProspectOrder,
  demoContext,
  demoQueueStats,
  demoReportFacts,
  endDemo,
  getCurrentDemo,
  sendLiveOrder,
  startDemo,
} from "./demo-service.server";

const databaseUrl = testDatabaseUrl();

const operator: TenantContext = {
  merchantId: "00000000-0000-7000-8000-000000009001",
  merchantIds: ["00000000-0000-7000-8000-000000009001", DEMO_MERCHANT_ID],
  researcherId: "00000000-0000-7000-8000-000000009002",
  correlationId: "00000000-0000-7000-8000-000000009003",
  roles: ["platform_admin"],
};

const product = (index: number, title: string, price: string) => ({
  productId: String(700 + index),
  variantId: String(800 + index),
  handle: title.toLowerCase().replaceAll(" ", "-"),
  title,
  sku: `SKU-${index}`,
  price,
  variantTitle: null,
  imageUrl: null,
});

const config: DemoConfig = {
  website: "https://juniper-row.example/",
  companyName: "Juniper Row",
  products: [
    product(1, "Harbor Tee", "34.00"),
    product(2, "Cloud Dew Moisturizer", "64.00"),
    product(3, "Trail Socks", "12.00"),
    product(4, "Travel Kit", "42.00"),
  ],
  heroIndex: 1,
  historicalOrders: 600,
  liveMinutes: 30,
  liveIntervalSeconds: 20,
};

/** A fixture cipher in the format the synthetic decryptor accepts. */
const fixtureCipher = {
  async encrypt(_subject: unknown, field: string, value: string) {
    return {
      ciphertext:
        field === "phone_e164"
          ? `synthetic:v1:${value}`
          : `synthetic:plain:${value}`,
      keyVersion: "synthetic-v1",
    };
  },
};

describe.skipIf(databaseUrl === undefined)("sales demo", () => {
  let isolated: IsolatedTestDatabase;
  let operations: PostgresOperationsApplicationService;
  const previousMode = process.env.HOLLER_DEMO_MODE;

  beforeAll(async () => {
    process.env.HOLLER_DEMO_MODE = "enabled";
    isolated = await createIsolatedTestDatabase(databaseUrl!);
    operations = new PostgresOperationsApplicationService(
      isolated.db,
      new PrefixedSyntheticPhoneDecryptor(),
    );
  }, 60_000);

  afterAll(async () => {
    process.env.HOLLER_DEMO_MODE = previousMode;
    await endDemo(isolated.db);
    await isolated?.close();
  });

  it("seeds the catalog, history, and angle, then queues live and prospect orders", async () => {
    const demoId = await startDemo(isolated.db, operations, operator, config, {
      startLiveOrders: false,
    });
    const demo = (await getCurrentDemo(isolated.db))!;
    expect(demo.id).toBe(demoId);
    expect(demo.companyName).toBe("Juniper Row");

    const context = demoContext(operator);
    const [moment] = await operations.listMoments(context);
    expect(moment).toMatchObject({
      name: "Why Cloud Dew Moisturizer buyers come back",
      status: "live",
    });
    expect(moment!.cohortSummary).toContain(
      "they previously ordered Cloud Dew Moisturizer",
    );

    const today = new Date();
    const dashboard = await operations.getDashboard(context, {
      start: new Date(today.getTime() - 200 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      end: today.toISOString().slice(0, 10),
      customerType: "all",
      attribution: "all",
      granularity: "week",
    });
    expect(dashboard.metrics.orders).toBeGreaterThanOrEqual(600);
    expect(repeatLeader(dashboard.repeatByProduct)?.product).toBe(
      "Cloud Dew Moisturizer",
    );

    // Live orders go through Shopify ingestion and qualification.
    for (let index = 0; index < 6; index += 1)
      await sendLiveOrder(isolated.db, demoId);
    const queue = await operations.listQueue(context);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((item) => item.maskedPhone.includes("01"))).toBe(true);

    const prospect = await addProspectOrder(
      isolated.db,
      operator,
      { firstName: "Alex", phone: "(202) 555-0177" },
      { cipher: fixtureCipher },
    );
    expect(prospect.lastFour).toBe("0177");
    const withProspect = await operations.listQueue(context);
    const prospectItem = withProspect.find(
      (item) => item.orderNumber === prospect.orderNumber,
    );
    expect(prospectItem).toMatchObject({
      moment: "Why Cloud Dew Moisturizer buyers come back",
      orderSequence: 2,
    });

    // Re-sending reuses the prospect and queues their next order.
    const again = await addProspectOrder(
      isolated.db,
      operator,
      { firstName: "Alex", phone: "+12025550177" },
      { cipher: fixtureCipher },
    );
    const resent = (await operations.listQueue(context)).find(
      (item) => item.orderNumber === again.orderNumber,
    );
    expect(resent?.orderSequence).toBe(3);

    const stats = await demoQueueStats(isolated.db, demo);
    expect(stats.queuedForAngle).toBeGreaterThanOrEqual(2);

    const facts = await demoReportFacts(isolated.db, demo);
    expect(facts.heroReorderDays).toBeGreaterThan(14);
    expect(facts.heroReorderDays).toBeLessThan(45);
    expect(facts.heroFirstOrderSources.length).toBeGreaterThan(1);
  }, 120_000);

  it("wipes the previous demo when a new one starts", async () => {
    await startDemo(
      isolated.db,
      operations,
      operator,
      { ...config, companyName: "Second Brand", historicalOrders: 300 },
      { startLiveOrders: false },
    );
    const result = await isolated.db.execute(sql`
      select
        (select count(*)::int from demo_sessions) as demos,
        (select count(*)::int from research_moments where merchant_id = ${DEMO_MERCHANT_ID} and kind = 'angle') as angles,
        (select count(*)::int from customer_private where merchant_id = ${DEMO_MERCHANT_ID}) as contacts,
        (select name from merchants where id = ${DEMO_MERCHANT_ID}) as name
    `);
    expect(result.rows[0]).toEqual({
      demos: 1,
      angles: 1,
      contacts: 0,
      name: "Second Brand",
    });
  }, 120_000);
});
