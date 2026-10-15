import { randomBytes } from "node:crypto";

import {
  CustomerPrivateCipher,
  EnvelopeEncryptionService,
  type DataKeyProvider,
} from "@holler/providers";
import { mapShopifyOrderWebhook } from "@holler/shopify";
import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { qualifyCommerceEvent } from "../../../worker/src/qualify-commerce-event";
import type { TenantContext } from "./operations-types";
import {
  EnvelopePhoneDecryptor,
  PostgresOperationsApplicationService,
} from "./postgres-operations-service.server";
import {
  applyShopifyOrderUpdate,
  ingestShopifyOrder,
  recordShopifyInstall,
  shopifyMerchantId,
} from "./shopify-ingestion.server";

class MemoryKms implements DataKeyProvider {
  private readonly keys = new Map<string, Buffer>();
  async generateDataKey() {
    const id = randomBytes(8).toString("hex");
    const key = randomBytes(32);
    this.keys.set(id, key);
    return {
      plaintextKey: Buffer.from(key),
      encryptedKey: id,
      keyVersion: "1",
    };
  }
  async decryptDataKey(input: { encryptedKey: string }) {
    const key = this.keys.get(input.encryptedKey);
    if (!key) throw new Error("KMS_DECRYPT_FAILED");
    return Buffer.from(key);
  }
}
const cipher = new CustomerPrivateCipher(
  new EnvelopeEncryptionService(
    new MemoryKms(),
    "projects/test/locations/us/keyRings/pii/cryptoKeys/customer-data",
  ),
);

const databaseUrl = testDatabaseUrl();
const shop = "holler-call-sheet-test.myshopify.com";
const installedAt = new Date("2026-09-28T12:00:00.000Z");
// Three minutes after the second order, inside the queue window.
const now = new Date("2026-09-30T14:03:00.000Z");
const merchantId = shopifyMerchantId(shop);
const context: TenantContext = {
  merchantId,
  merchantIds: [merchantId],
  researcherId: "00000000-0000-7000-8000-000000003001",
  correlationId: "00000000-0000-7000-8000-000000003002",
  roles: ["researcher", "research_manager"],
};

let delivery = 0;
function webhook(
  order: number,
  createdAt: string,
  extra: Record<string, unknown> = {},
) {
  delivery += 1;
  return mapShopifyOrderWebhook({
    webhookId: `00000000-0000-4000-8000-${String(delivery).padStart(12, "0")}`,
    eventId: null,
    shopDomain: shop,
    apiVersion: "2026-10",
    triggeredAt: createdAt,
    payload: {
      admin_graphql_api_id: `gid://shopify/Order/${order}`,
      name: `#${order}`,
      created_at: createdAt,
      updated_at: createdAt,
      currency: "USD",
      financial_status: "paid",
      total_price: "52.00",
      shipping_address: {
        address1: "1 Example St",
        city: "Portland",
        province_code: "OR",
      },
      customer: {
        admin_graphql_api_id: "gid://shopify/Customer/3001",
        phone: "(202) 555-0142",
        first_name: "Avery",
        created_at: "2026-09-28T13:00:00.000Z",
      },
      line_items: [
        {
          admin_graphql_api_id: `gid://shopify/LineItem/${order}1`,
          product_id: 900000000601,
          variant_id: 900000000602,
          sku: "TEE-NV-M",
          title: "Harbor tee",
          variant_title: "M / Navy",
          quantity: 2,
          price: "30.00",
          discount_allocations: [{ amount: "5.00" }, { amount: "3.00" }],
        },
      ],
      ...extra,
    },
  });
}

describe.skipIf(databaseUrl === undefined)("call sheet", () => {
  let isolated: IsolatedTestDatabase;
  let service: PostgresOperationsApplicationService;

  beforeAll(async () => {
    isolated = await createIsolatedTestDatabase(databaseUrl!);
    await recordShopifyInstall(isolated.db, shop, installedAt);
    service = new PostgresOperationsApplicationService(
      isolated.db,
      new EnvelopePhoneDecryptor(cipher),
      () => now,
    );
    // Publish before the orders arrive so they qualify.
    await new PostgresOperationsApplicationService(
      isolated.db,
      new EnvelopePhoneDecryptor(cipher),
      () => installedAt,
    ).saveMoment(context, {
      name: "Second order",
      objective: "Why customers come back",
      weeklyTarget: 5,
      cohortExpression: {
        predicate: "customer.order_sequence",
        version: 1,
        config: { operator: "equals", value: 2 },
      },
      fields: [
        {
          kind: "new",
          label: "Why did you come back?",
          prompt: "What brought you back for a second order?",
          required: true,
        },
        {
          kind: "new",
          label: "Fit",
          prompt: "How is the fit?",
          required: false,
          scope: "item",
        },
      ],
      publish: true,
    });
  }, 30_000);

  afterAll(async () => isolated?.close(), 30_000);

  it("keeps refunds current from orders/updated without queueing anything", async () => {
    await ingestShopifyOrder(
      isolated.db,
      webhook(4001, "2026-09-29T10:00:00.000Z"),
      "a".repeat(64),
      now,
      cipher,
    );
    const second = await ingestShopifyOrder(
      isolated.db,
      webhook(4002, "2026-09-30T14:00:00.000Z"),
      "b".repeat(64),
      now,
      cipher,
    );
    const refund = {
      updated_at: "2026-09-30T09:00:00.000Z",
      financial_status: "partially_refunded",
      fulfillment_status: "fulfilled",
      refunds: [{ refund_line_items: [{ line_item_id: 40011, quantity: 1 }] }],
    };
    expect(
      await applyShopifyOrderUpdate(
        isolated.db,
        webhook(4001, "2026-09-29T10:00:00.000Z", refund),
        "c".repeat(64),
        now,
      ),
    ).toEqual({ outcome: "updated", merchantId });
    expect(
      await applyShopifyOrderUpdate(
        isolated.db,
        webhook(4001, "2026-09-29T10:00:00.000Z", {
          updated_at: "2026-09-29T11:00:00.000Z",
        }),
        "d".repeat(64),
        now,
      ),
    ).toMatchObject({ outcome: "stale" });
    expect(
      await applyShopifyOrderUpdate(
        isolated.db,
        webhook(4999, "2026-09-29T10:00:00.000Z"),
        "e".repeat(64),
        now,
      ),
    ).toMatchObject({ outcome: "unknown_order" });

    const counts = await isolated.db.execute(sql`
      select
        (select count(*)::int from orders) orders,
        (select count(*)::int from commerce_events) events,
        (select refunded_quantity from order_line_items where shopify_line_item_id = 'gid://shopify/LineItem/40011') refunded,
        (select financial_status from orders where shopify_order_id = 'gid://shopify/Order/4001') financial`);
    expect(counts.rows[0]).toEqual({
      orders: 2,
      events: 2,
      refunded: 1,
      financial: "partially_refunded",
    });

    if (second.outcome !== "ingested") throw new Error("expected ingest");
    await qualifyCommerceEvent(
      isolated.db,
      { merchantId, commerceEventId: second.commerceEventId },
      now,
    );
  });

  it("shows the claimant a decrypted, audited profile and grouped history", async () => {
    const [queued] = await service.listQueue(context);
    expect(queued).toMatchObject({
      orderNumber: "#4002",
      locality: "Portland, OR",
    });
    await service.claimAssignment(context, queued!.id, queued!.lockVersion);
    const sheet = await service.startInterview(context, queued!.id, 1);

    expect(sheet.profile).toMatchObject({
      firstName: "Avery",
      locality: "Portland, OR",
      orderCount: 2,
      shopifyCustomerId: "3001",
      historyComplete: true,
    });
    expect(sheet.currentOrder).toMatchObject({
      orderNumber: "#4002",
      discountTotal: "$8.00",
      lines: [
        {
          product: "Harbor tee",
          variant: "M / Navy",
          quantity: 2,
          unitPrice: "$30.00",
          discount: "$8.00",
          lineTotal: "$52.00",
          returnStatus: "kept",
        },
      ],
    });
    expect(sheet.pastOrders).toHaveLength(1);
    expect(sheet.pastOrders[0]).toMatchObject({
      orderNumber: "#4001",
      financialStatus: "partially_refunded",
      lines: [{ refundedQuantity: 1, returnStatus: "partially_returned" }],
    });

    const audits = await isolated.db.execute(sql`
      select metadata from audit_events
      where action = 'customer_private.profile_viewed' and subject_id = ${queued!.id}`);
    expect(audits.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits.rows)).not.toMatch(/Avery|Portland/);
    const stored = await isolated.db.execute(
      sql`select encrypted_locality from customer_private`,
    );
    expect(String(stored.rows[0]?.encrypted_locality)).toMatch(/^env1:/);
  });

  it("requires required prompts to be marked done, not answered", async () => {
    const [current] = await service.listQueue(context);
    const sheet = await service.startInterview(context, current!.id, 0);
    const field = sheet.prompts.find(
      (prompt) => prompt.kind === "field" && prompt.scope === "order",
    )!;
    expect(field).toMatchObject({ required: true, covered: false });
    expect(sheet.prompts[0]).toMatchObject({ kind: "script", scope: "order" });

    // Item prompts get one row per line of this order, keyed to the line.
    const lineId = sheet.currentOrder!.lines[0]!.id;
    const fit = sheet.prompts.filter((prompt) => prompt.title === "Fit");
    expect(fit).toEqual([
      expect.objectContaining({
        scope: "item",
        lineId,
        key: expect.stringMatching(new RegExp(`@line:${lineId}$`)),
      }),
    ]);
    await service.savePromptProgress(context, sheet.id, fit[0]!.key, {
      covered: true,
      selected: [],
      note: "Runs a little small",
    });

    await expect(
      service.completeInterview(context, sheet.id, "completed"),
    ).rejects.toMatchObject({ code: "INTERVIEW_INCOMPLETE" });
    await expect(
      service.savePromptProgress(context, sheet.id, field.key, {
        covered: true,
        selected: ["Not an option"],
        note: "",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PROMPT_PROGRESS" });
    await service.savePromptProgress(context, sheet.id, field.key, {
      covered: true,
      selected: [],
      note: "  Loved the fit of the first tee  ",
    });

    const reloaded = await service.getInterview(context, sheet.id);
    expect(reloaded.prompts.find((p) => p.key === field.key)).toMatchObject({
      covered: true,
      note: "Loved the fit of the first tee",
    });
    const responses = await isolated.db.execute(
      sql`select value from interview_responses where interview_id = ${sheet.id}`,
    );
    // Item answers stay on the call sheet; only the order field is mirrored.
    expect(responses.rows).toEqual([
      { value: "Loved the fit of the first tee" },
    ]);
    await service.completeInterview(context, sheet.id, "completed");
    await expect(
      service.getInterview(context, sheet.id),
    ).resolves.toMatchObject({ status: "completed" });
  });
});
