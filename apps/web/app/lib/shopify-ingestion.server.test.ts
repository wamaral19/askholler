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

// The worker owns qualification; exercising it here covers the full
// webhook -> commerce event -> assignment slice against one database.
import { qualifyCommerceEvent } from "../../../worker/src/qualify-commerce-event";
import type { TenantContext } from "./operations-types";
import {
  EnvelopePhoneDecryptor,
  PostgresOperationsApplicationService,
  PrefixedSyntheticPhoneDecryptor,
} from "./postgres-operations-service.server";
import {
  ingestShopifyOrder,
  recordShopifyInstall,
  shopifyMerchantId,
  normalizePhoneE164,
  recordShopifyPrivacyRequest,
} from "./shopify-ingestion.server";

/** In-memory stand-in for Cloud KMS; each data key is "wrapped" by id. */
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
const shop = "holler-ingest-test.myshopify.com";
const installedAt = new Date("2026-09-28T12:00:00.000Z");
const merchantId = shopifyMerchantId(shop);
const context: TenantContext = {
  merchantId,
  merchantIds: [merchantId],
  researcherId: "00000000-0000-7000-8000-000000002001",
  correlationId: "00000000-0000-7000-8000-000000002002",
  roles: ["researcher"],
};

let deliverySequence = 0;
function orderWebhook(input: {
  order: number;
  customer: number | null;
  customerCreatedAt?: string;
  createdAt: string;
  webhookId?: string;
  phone?: string | null;
}) {
  deliverySequence += 1;
  return mapShopifyOrderWebhook({
    webhookId:
      input.webhookId ??
      `00000000-0000-4000-8000-${String(deliverySequence).padStart(12, "0")}`,
    eventId: null,
    shopDomain: shop,
    apiVersion: "2026-10",
    triggeredAt: input.createdAt,
    payload: {
      admin_graphql_api_id: `gid://shopify/Order/${input.order}`,
      name: `#${input.order}`,
      created_at: input.createdAt,
      updated_at: input.createdAt,
      currency: "USD",
      total_price: "30.00",
      customer:
        input.customer === null
          ? null
          : {
              admin_graphql_api_id: `gid://shopify/Customer/${input.customer}`,
              phone: input.phone === undefined ? "(202) 555-0142" : input.phone,
              first_name: "Avery",
              created_at: input.customerCreatedAt ?? input.createdAt,
            },
      line_items: [
        {
          admin_graphql_api_id: `gid://shopify/LineItem/${input.order}1`,
          product_id: 900000000501,
          variant_id: null,
          sku: "KIT-1",
          title: "Travel kit",
          quantity: 2,
          price: "15.00",
        },
      ],
    },
  });
}

describe.skipIf(databaseUrl === undefined)(
  "Shopify order ingestion and qualification",
  () => {
    let isolated: IsolatedTestDatabase;

    const count = async (query: ReturnType<typeof sql>) => {
      const result = await isolated.db.execute(query);
      return Number(result.rows[0]?.count ?? 0);
    };

    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(databaseUrl!);
      await recordShopifyInstall(isolated.db, shop, installedAt);
      const service = new PostgresOperationsApplicationService(
        isolated.db,
        new PrefixedSyntheticPhoneDecryptor(),
        () => installedAt,
      );
      await service.saveMoment(context, {
        name: "First purchase discovery",
        objective: "Understand how new customers found the brand",
        weeklyTarget: 1,
        cohortExpression: {
          predicate: "customer.order_sequence",
          version: 1,
          config: { operator: "equals", value: 1 },
        },
        fields: [
          {
            kind: "new",
            label: "How did you first hear about us?",
            prompt: "",
            required: true,
          },
        ],
        publish: true,
      });
    }, 30_000);

    afterAll(async () => isolated?.close(), 30_000);

    it("keeps installedAt stable when an active install re-authenticates", async () => {
      await recordShopifyInstall(
        isolated.db,
        shop,
        new Date("2026-09-28T13:00:00.000Z"),
      );
      const result = await isolated.db.execute(
        sql`select installed_at from merchants where id = ${merchantId}`,
      );
      expect(new Date(String(result.rows[0]?.installed_at))).toEqual(
        installedAt,
      );
    });

    it("offers migrated platform fields to a newly installed merchant", async () => {
      const service = new PostgresOperationsApplicationService(
        isolated.db,
        new PrefixedSyntheticPhoneDecryptor(),
        () => installedAt,
      );
      const fields = (await service.listResearchFields(context)).filter(
        (field) => field.source === "platform_default",
      );
      expect(
        fields.map(({ label, source, required }) => ({
          label,
          source,
          required,
        })),
      ).toEqual([
        {
          label: "Discovery source",
          source: "platform_default",
          required: true,
        },
        {
          label: "Marketing influence",
          source: "platform_default",
          required: true,
        },
        {
          label: "Purchase trigger",
          source: "platform_default",
          required: true,
        },
      ]);
      // A draft with only platform fields saves; drafts are never qualified.
      await expect(
        service.saveMoment(context, {
          name: "Platform fields only",
          objective: "Draft using platform defaults",
          weeklyTarget: 1,
          cohortExpression: {
            predicate: "customer.order_sequence",
            version: 1,
            config: { operator: "at_least", value: 2 },
          },
          fields: fields.map((field) => ({
            kind: "library" as const,
            fieldVersionId: field.id,
            required: field.required,
          })),
          publish: false,
        }),
      ).resolves.toHaveProperty("id");
    });

    it("ingests once per delivery and once per order fact", async () => {
      const first = orderWebhook({
        order: 1001,
        customer: 2001,
        createdAt: "2026-09-28T14:00:00.000Z",
      });
      const ingested = await ingestShopifyOrder(
        isolated.db,
        first,
        "a".repeat(64),
        new Date(),
        cipher,
      );
      expect(ingested.outcome).toBe("ingested");
      expect(
        await ingestShopifyOrder(
          isolated.db,
          first,
          "a".repeat(64),
          new Date(),
          cipher,
        ),
      ).toEqual({ outcome: "duplicate_delivery", merchantId });

      const redelivered = orderWebhook({
        order: 1001,
        customer: 2001,
        createdAt: "2026-09-28T14:00:00.000Z",
      });
      const second = await ingestShopifyOrder(
        isolated.db,
        redelivered,
        "a".repeat(64),
        new Date(),
        cipher,
      );
      expect(second).toEqual(ingested);

      expect(await count(sql`select count(*) from webhook_receipts`)).toBe(2);
      expect(await count(sql`select count(*) from orders`)).toBe(1);
      expect(await count(sql`select count(*) from commerce_events`)).toBe(1);
      expect(
        await count(
          sql`select count(*) from outbox_events where event_type = 'evaluate_commerce_event'`,
        ),
      ).toBe(1);
      const customer = await isolated.db.execute(
        sql`select order_count, lifetime_revenue_minor, history_completeness->>'state' as state from customers`,
      );
      expect(customer.rows[0]).toMatchObject({
        order_count: 1,
        lifetime_revenue_minor: "3000",
        state: "complete",
      });
      const contact = await isolated.db.execute(
        sql`select encrypted_phone_e164, encrypted_given_name, phone_last_four, expires_at from customer_private`,
      );
      expect(contact.rows).toHaveLength(1);
      const row = contact.rows[0] as Record<string, unknown>;
      expect(row.phone_last_four).toBe("0142");
      expect(String(row.encrypted_phone_e164)).toMatch(/^env1:/);
      expect(JSON.stringify(row)).not.toMatch(/2025550142|Avery/);
      expect(row.expires_at).not.toBeNull();
    });

    it("qualifies a first order into the queue exactly once", async () => {
      const event = await isolated.db.execute(
        sql`select id from commerce_events limit 1`,
      );
      const payload = {
        merchantId,
        commerceEventId: String(event.rows[0]?.id),
      };
      const now = new Date("2026-09-28T14:01:00.000Z");
      await qualifyCommerceEvent(isolated.db, payload, now);
      await qualifyCommerceEvent(isolated.db, payload, now);

      const assignments = await isolated.db.execute(
        sql`select status from research_assignments`,
      );
      expect(assignments.rows).toEqual([{ status: "queued" }]);

      const service = new PostgresOperationsApplicationService(
        isolated.db,
        new EnvelopePhoneDecryptor(cipher),
        () => now,
      );
      const [queued] = await service.listQueue(context);
      expect(queued).toMatchObject({
        customerName: "Customer",
        maskedPhone: "••• ••• 0142",
        orderNumber: "#1001",
        shopifyCustomerId: "2001",
      });
      await service.claimAssignment(context, queued!.id, queued!.lockVersion);
      await expect(service.revealPhone(context, queued!.id)).resolves.toEqual({
        phone: "+12025550142",
      });
      // Real-mode reveal never trusts a synthetic fixture value.
      await isolated.db.execute(
        sql`update customer_private set encrypted_phone_e164 = 'synthetic:v1:+12025550123', key_version = 'synthetic-v1'`,
      );
      await expect(
        service.revealPhone(context, queued!.id),
      ).rejects.toMatchObject({ code: "PHONE_REVEAL_DENIED" });
      await service.releaseAssignment(context, queued!.id, 1);
    });

    it("records repeat, capped, and incomplete-history orders without assigning", async () => {
      const now = new Date("2026-09-28T16:00:00.000Z");
      const cases = [
        // Same customer's second order: sequence 2, cohort requires 1.
        { order: 1002, customer: 2001, createdAt: "2026-09-28T15:00:00.000Z" },
        // New customer's first order: matches, but the weekly cap of 1 is used.
        { order: 1003, customer: 2002, createdAt: "2026-09-28T15:10:00.000Z" },
        // Customer created before install: history incomplete, fails closed.
        {
          order: 1004,
          customer: 2003,
          customerCreatedAt: "2025-01-01T00:00:00.000Z",
          createdAt: "2026-09-28T15:20:00.000Z",
        },
      ];
      const reasons: string[][] = [];
      for (const input of cases) {
        const result = await ingestShopifyOrder(
          isolated.db,
          orderWebhook(input),
          "b".repeat(64),
          new Date(),
          cipher,
        );
        if (result.outcome !== "ingested") throw new Error("not ingested");
        await qualifyCommerceEvent(
          isolated.db,
          { merchantId, commerceEventId: result.commerceEventId },
          now,
        );
        const evaluation = await isolated.db.execute(
          sql`select reason_codes from qualification_evaluations where commerce_event_id = ${result.commerceEventId}`,
        );
        reasons.push(evaluation.rows[0]?.reason_codes as string[]);
      }

      expect(reasons).toEqual([
        ["cohort.no_match"],
        ["cohort.match", "allocation.weekly_cap_reached"],
        ["customer.order_sequence.v1.history_incomplete"],
      ]);
      expect(await count(sql`select count(*) from research_assignments`)).toBe(
        1,
      );
    });

    it("evaluates but never queues a customer without a usable phone", async () => {
      const result = await ingestShopifyOrder(
        isolated.db,
        orderWebhook({
          order: 1005,
          customer: 2005,
          createdAt: "2026-09-28T17:00:00.000Z",
          phone: "call me maybe",
        }),
        "c".repeat(64),
        new Date(),
        cipher,
      );
      if (result.outcome !== "ingested") throw new Error("not ingested");
      await qualifyCommerceEvent(
        isolated.db,
        { merchantId, commerceEventId: result.commerceEventId },
        new Date("2026-09-28T17:01:00.000Z"),
      );
      const evaluation = await isolated.db.execute(
        sql`select reason_codes from qualification_evaluations where commerce_event_id = ${result.commerceEventId}`,
      );
      expect(evaluation.rows[0]?.reason_codes).toEqual([
        "cohort.match",
        "contact.not_contactable",
      ]);
      expect(
        await count(
          sql`select count(*) from research_assignments where commerce_event_id = ${result.commerceEventId}`,
        ),
      ).toBe(0);
    });

    it("keeps a customer suppressed after they ask not to be contacted", async () => {
      const now = new Date("2026-09-28T14:30:00.000Z");
      const service = new PostgresOperationsApplicationService(
        isolated.db,
        new EnvelopePhoneDecryptor(cipher),
        () => now,
      );
      const [queued] = await service.listQueue(context);
      const claimed = await service.claimAssignment(
        context,
        queued!.id,
        queued!.lockVersion,
      );
      const interview = await service.startInterview(
        context,
        claimed.id,
        claimed.lockVersion,
      );
      await service.completeInterview(context, interview.id, "declined");

      const customer = await isolated.db.execute(
        sql`select c.contactability_status from customers c join research_assignments a on a.customer_id = c.id where a.id = ${queued!.id}`,
      );
      expect(customer.rows[0]).toEqual({ contactability_status: "suppressed" });
      expect(
        await count(
          sql`select count(*) from audit_events where action = 'customer.contact_suppressed'`,
        ),
      ).toBe(1);

      // A later order re-sends the phone, but the opt-out stands.
      const later = await ingestShopifyOrder(
        isolated.db,
        orderWebhook({
          order: 1006,
          customer: 2001,
          createdAt: "2026-09-28T18:00:00.000Z",
        }),
        "d".repeat(64),
        new Date(),
        cipher,
      );
      expect(later.outcome).toBe("ingested");
      // Only "eligible" customers qualify (see the no-phone case above).
      expect(
        (
          await isolated.db.execute(
            sql`select contactability_status from customers where shopify_customer_id = 'gid://shopify/Customer/2001'`,
          )
        ).rows[0],
      ).toEqual({ contactability_status: "suppressed" });
    });

    it("records Shopify privacy webhooks for the worker and operators", async () => {
      const redact = { customer: { id: 2001 }, orders_to_redact: [1001] };
      expect(
        await recordShopifyPrivacyRequest(
          isolated.db,
          shop,
          "CUSTOMERS_REDACT",
          redact,
        ),
      ).toBe("recorded");
      // Shopify retries webhooks; a repeat is the same request.
      await recordShopifyPrivacyRequest(
        isolated.db,
        shop,
        "CUSTOMERS_REDACT",
        redact,
      );
      expect(
        await recordShopifyPrivacyRequest(
          isolated.db,
          shop,
          "CUSTOMERS_DATA_REQUEST",
          { customer: { id: 2001 }, data_request: { id: 9 } },
        ),
      ).toBe("recorded");
      expect(
        await recordShopifyPrivacyRequest(isolated.db, shop, "SHOP_REDACT", {}),
      ).toBe("recorded");
      expect(
        await recordShopifyPrivacyRequest(
          isolated.db,
          shop,
          "CUSTOMERS_REDACT",
          { customer: { id: 999999 } },
        ),
      ).toBe("nothing_stored");
      expect(
        await recordShopifyPrivacyRequest(
          isolated.db,
          "never-installed.myshopify.com",
          "SHOP_REDACT",
          {},
        ),
      ).toBe("nothing_stored");
      expect(
        await recordShopifyPrivacyRequest(
          isolated.db,
          shop,
          "CUSTOMERS_REDACT",
          { customer: {} },
        ),
      ).toBe("invalid_payload");

      const requests = await isolated.db.execute(
        sql`select scope, status, subject_id is not null as has_subject from deletion_requests order by scope`,
      );
      expect(requests.rows).toEqual([
        { scope: "customer", status: "pending", has_subject: true },
        { scope: "shop", status: "pending", has_subject: false },
      ]);
      expect(
        await count(
          sql`select count(*) from audit_events where action = 'privacy.data_request_received'`,
        ),
      ).toBe(1);
    });

    it("normalizes phones to E.164 and drops ambiguous values", () => {
      expect(normalizePhoneE164("(202) 555-0142")).toBe("+12025550142");
      expect(normalizePhoneE164("1-202-555-0142")).toBe("+12025550142");
      expect(normalizePhoneE164("+44 20 7946 0958")).toBe("+442079460958");
      for (const value of [null, "", "555-0142", "call me maybe", "+0123"])
        expect(normalizePhoneE164(value)).toBeNull();
    });
  },
);
