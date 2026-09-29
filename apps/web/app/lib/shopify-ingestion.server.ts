import { createHash, randomUUID } from "node:crypto";

import {
  assertOperationalJobPayload,
  auditEvents,
  requestDeletion,
  commerceEvents,
  createDatabase,
  customerPrivate,
  customers,
  merchants,
  orderLineItems,
  orders,
  outboxEvents,
  products,
  scripts,
  scriptVersions,
  webhookReceipts,
  type HollerDatabase,
} from "@holler/db";
import type { ObservedAttributionV1 } from "@holler/domain";
import type { CustomerPrivateCipher } from "@holler/providers";
import {
  moneyToMinor,
  normalizeShopifyOrderIngress,
  type ShopifyOrderIngressV1,
} from "@holler/shopify";
import { and, eq, lt, ne, sql } from "drizzle-orm";

type Transaction = Parameters<Parameters<HollerDatabase["transaction"]>[0]>[0];
type HistoryCompleteness = {
  state: "complete" | "partial" | "unknown";
  historyStartAt: string | null;
  reason: "full_import" | "import_pending" | "guest_customer" | "unknown";
};

export type ShopifyOrderIngestionResult =
  | { outcome: "ingested"; merchantId: string; commerceEventId: string }
  | { outcome: "duplicate_delivery"; merchantId: string };

let database: HollerDatabase | undefined;
export function getShopifyIngestionDatabase(): HollerDatabase {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for Shopify ingestion");
  database ??= createDatabase(url).db;
  return database;
}

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Deterministic so operators can derive a shop's merchant ID offline. */
export function shopifyMerchantId(shopDomain: string): string {
  return stableUuid(`shopify-shop:${shopDomain.toLowerCase()}`);
}

/**
 * Records an install (or reinstall). `installedAt` restarts on reinstall
 * because webhooks missed while uninstalled break history completeness.
 * Also provisions a merchant-scoped default script so moments can be built.
 */
export async function recordShopifyInstall(
  db: HollerDatabase,
  shopDomain: string,
  now = new Date(),
): Promise<string> {
  const merchantId = shopifyMerchantId(shopDomain);
  await db.transaction(async (tx) => {
    await tx
      .insert(merchants)
      .values({
        id: merchantId,
        shopDomain,
        name: shopDomain,
        timezone: "UTC",
        status: "active",
        installedAt: now,
      })
      .onConflictDoUpdate({
        target: merchants.id,
        set: {
          status: "active",
          installedAt: sql`case when ${merchants.status} = 'active' and ${merchants.installedAt} is not null then ${merchants.installedAt} else ${now} end`,
          uninstalledAt: null,
          updatedAt: now,
        },
      });
    const scriptId = stableUuid(`default-script:${merchantId}`);
    await tx
      .insert(scripts)
      .values({
        id: scriptId,
        merchantId,
        name: "Default attribution interview",
        status: "published",
      })
      .onConflictDoNothing();
    const content = { prompts: ["discovery", "trigger", "influence"] };
    await tx
      .insert(scriptVersions)
      .values({
        id: stableUuid(`default-script-version:${merchantId}`),
        scriptId,
        merchantId,
        version: 1,
        status: "published",
        content,
        checksum: createHash("sha256")
          .update(JSON.stringify(content))
          .digest("hex"),
        publishedAt: now,
      })
      .onConflictDoNothing();
  });
  return merchantId;
}

export async function recordShopifyUninstall(
  db: HollerDatabase,
  shopDomain: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(merchants)
    .set({ status: "uninstalled", uninstalledAt: now, updatedAt: now })
    .where(eq(merchants.id, shopifyMerchantId(shopDomain)));
}

/**
 * Persists a verified `orders/create` delivery in one transaction: receipt
 * (deduplicated by delivery ID), commerce projections, the normalized
 * CommerceEvent, and the qualification outbox job. Nothing from the payload
 * outside the allowlisted envelope is stored. Phone and first name are
 * persisted only KMS-encrypted, so without a cipher they are dropped.
 */
export async function ingestShopifyOrder(
  db: HollerDatabase,
  ingress: ShopifyOrderIngressV1,
  bodySha256: string,
  now = new Date(),
  cipher?: CustomerPrivateCipher,
): Promise<ShopifyOrderIngestionResult> {
  const merchantId = shopifyMerchantId(ingress.shopDomain);
  // KMS calls happen before the transaction so it never waits on the network.
  const contact =
    cipher && ingress.order.customer
      ? await encryptContact(
          cipher,
          merchantId,
          customerIdFor(merchantId, ingress.order.customer.id),
          ingress.order.customer,
          now,
        )
      : undefined;
  return db.transaction(async (tx) => {
    const merchant = await ensureMerchant(tx, merchantId, ingress.shopDomain);
    const [receipt] = await tx
      .insert(webhookReceipts)
      .values({
        id: randomUUID(),
        merchantId,
        provider: "shopify",
        deliveryId: ingress.webhookId,
        topic: "orders/create",
        bodySha256,
        receivedAt: now,
        processingStatus: "processed",
      })
      .onConflictDoNothing({
        target: [webhookReceipts.provider, webhookReceipts.deliveryId],
      })
      .returning({ id: webhookReceipts.id });
    if (!receipt) return { outcome: "duplicate_delivery", merchantId };

    const order = ingress.order;
    const orderId = stableUuid(`shopify-order:${merchantId}:${order.id}`);
    const orderedAt = new Date(order.createdAt);
    const customer = order.customer
      ? await upsertCustomer(tx, merchantId, merchant.installedAt, {
          shopifyCustomerId: order.customer.id,
          createdAt: order.customer.createdAt,
        })
      : null;
    const history: HistoryCompleteness = customer?.history ?? {
      state: "unknown",
      historyStartAt: null,
      reason: "guest_customer",
    };
    const customerOrderSequence =
      customer && history.state === "complete"
        ? (await countPriorOrders(
            tx,
            merchantId,
            customer.id,
            orderId,
            orderedAt,
          )) + 1
        : null;

    await tx
      .insert(orders)
      .values({
        id: orderId,
        merchantId,
        customerId: customer?.id ?? null,
        shopifyOrderId: order.id,
        orderedAt,
        sourceUpdatedAt: new Date(order.updatedAt),
        totalMinor: moneyToMinor(order.total.amount, order.total.currency),
        currency: order.total.currency,
        customerOrderSequence,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        observedAttribution: order.observedAttribution,
      })
      .onConflictDoNothing({
        target: [orders.merchantId, orders.shopifyOrderId],
      });

    for (const line of order.lineItems) {
      const productId = line.productId
        ? await upsertProduct(tx, merchantId, line.productId, line.title, now)
        : null;
      await tx
        .insert(orderLineItems)
        .values({
          id: stableUuid(`shopify-line:${merchantId}:${line.id}`),
          merchantId,
          orderId,
          shopifyLineItemId: line.id,
          productId,
          shopifyVariantId: line.variantId,
          sku: line.sku,
          title: line.title,
          quantity: line.quantity,
          unitPriceMinor: moneyToMinor(
            line.unitPrice.amount,
            line.unitPrice.currency,
          ),
          currency: line.unitPrice.currency,
        })
        .onConflictDoNothing();
    }
    if (customer) await refreshCustomerTotals(tx, merchantId, customer.id, now);
    if (customer && contact)
      await storeContact(tx, merchantId, customer.id, contact, now);

    const catalogEnrichment = { state: "pending" as const, refreshedAt: null };
    const { event, identity } = normalizeShopifyOrderIngress(ingress, {
      merchantId,
      orderId,
      customerId: customer?.id ?? null,
      customerOrderSequence,
      historyCompleteness: history,
      catalogEnrichment,
    });
    const commerceEventId = stableUuid(`commerce-event:${identity}`);
    await tx
      .insert(commerceEvents)
      .values({
        id: commerceEventId,
        merchantId,
        customerId: event.customerId,
        orderId,
        eventType: event.eventType,
        source: event.source,
        sourceEventId: event.sourceEventId,
        occurredAt: orderedAt,
        ingestedAt: now,
        schemaVersion: event.schemaVersion,
        attributes: {
          customerOrderSequence,
          historyCompleteness: history,
          catalogEnrichment,
        },
        observedAttribution:
          event.observedAttribution satisfies ObservedAttributionV1,
        correlationId: randomUUID(),
      })
      .onConflictDoNothing({
        target: [
          commerceEvents.merchantId,
          commerceEvents.source,
          commerceEvents.sourceEventId,
        ],
      });

    const payload = { merchantId, commerceEventId };
    assertOperationalJobPayload(payload);
    const jobKey = `evaluate_commerce_event:${commerceEventId}`;
    await tx
      .insert(outboxEvents)
      .values({
        id: randomUUID(),
        merchantId,
        aggregateType: "evaluate_commerce_event",
        aggregateId: commerceEventId,
        eventType: "evaluate_commerce_event",
        payload,
        schemaVersion: 1,
        idempotencyKey: `job:${merchantId}:evaluate_commerce_event:${jobKey}`,
        correlationId: randomUUID(),
      })
      .onConflictDoNothing({ target: outboxEvents.idempotencyKey });

    return { outcome: "ingested", merchantId, commerceEventId };
  });
}

async function ensureMerchant(
  tx: Transaction,
  merchantId: string,
  shopDomain: string,
): Promise<{ installedAt: Date | null }> {
  // Normally created by afterAuth; a webhook that races install gets a
  // merchant with unknown install time, so its history stays incomplete.
  await tx
    .insert(merchants)
    .values({
      id: merchantId,
      shopDomain,
      name: shopDomain,
      timezone: "UTC",
      status: "active",
    })
    .onConflictDoNothing();
  const [merchant] = await tx
    .select({ installedAt: merchants.installedAt })
    .from(merchants)
    .where(eq(merchants.id, merchantId));
  if (!merchant) throw new Error("SHOPIFY_MERCHANT_UNRESOLVED");
  return merchant;
}

/**
 * A customer's history is complete only when Shopify created them after
 * Holler's install, so every one of their orders arrived via webhook. Once
 * complete it stays complete; older customers remain partial until a
 * historical import exists.
 */
function customerIdFor(merchantId: string, shopifyCustomerId: string): string {
  return stableUuid(`shopify-customer:${merchantId}:${shopifyCustomerId}`);
}

/**
 * Records a verified Shopify privacy webhook. Redactions become deletion
 * requests for the worker's sweep; a data request becomes an audit event for
 * an operator to answer. Unknown shops and customers have nothing stored.
 */
export async function recordShopifyPrivacyRequest(
  db: HollerDatabase,
  shopDomain: string,
  topic: "CUSTOMERS_REDACT" | "SHOP_REDACT" | "CUSTOMERS_DATA_REQUEST",
  payload: unknown,
  now = new Date(),
): Promise<"recorded" | "nothing_stored" | "invalid_payload"> {
  const merchantId = shopifyMerchantId(shopDomain);
  const [merchant] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.id, merchantId));
  if (!merchant) return "nothing_stored";
  if (topic === "SHOP_REDACT") {
    await requestDeletion(db, merchantId, { scope: "shop" }, now);
    return "recorded";
  }
  const shopifyCustomerId = (payload as { customer?: { id?: unknown } })
    ?.customer?.id;
  if (
    typeof shopifyCustomerId !== "number" &&
    typeof shopifyCustomerId !== "string"
  )
    return "invalid_payload";
  const customerId = customerIdFor(
    merchantId,
    `gid://shopify/Customer/${shopifyCustomerId}`,
  );
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(eq(customers.merchantId, merchantId), eq(customers.id, customerId)),
    );
  if (!customer) return "nothing_stored";
  if (topic === "CUSTOMERS_REDACT") {
    await requestDeletion(
      db,
      merchantId,
      { scope: "customer", customerId },
      now,
    );
    return "recorded";
  }
  await db.insert(auditEvents).values({
    id: randomUUID(),
    merchantId,
    actorId: null,
    action: "privacy.data_request_received",
    subjectType: "customer",
    subjectId: customerId,
    metadata: { source: "shopify" },
    occurredAt: now,
  });
  return "recorded";
}

/** Recruitment PII is kept for 90 days after the latest order (signoff schedule). */
export const CUSTOMER_PII_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

interface EncryptedContact {
  readonly phone: { ciphertext: string; lastFour: string } | null;
  readonly givenName: string | null;
  readonly keyVersion: string;
  readonly expiresAt: Date;
}

/**
 * Normalizes a Shopify phone to E.164. Numbers without a country code are
 * treated as North American; anything else ambiguous is dropped, which makes
 * the customer ineligible for calls rather than risking a wrong number.
 */
export function normalizePhoneE164(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  const candidate = trimmed.startsWith("+")
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith("1")
        ? `+${digits}`
        : null;
  return candidate && /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

async function encryptContact(
  cipher: CustomerPrivateCipher,
  merchantId: string,
  customerId: string,
  source: { phone: string | null; firstName: string | null },
  now: Date,
): Promise<EncryptedContact | undefined> {
  const phone = normalizePhoneE164(source.phone);
  if (!phone && !source.firstName) return undefined;
  const subject = { merchantId, customerId };
  const [encryptedPhone, encryptedName] = await Promise.all([
    phone ? cipher.encrypt(subject, "phone_e164", phone) : undefined,
    source.firstName
      ? cipher.encrypt(subject, "given_name", source.firstName)
      : undefined,
  ]);
  return {
    phone: encryptedPhone
      ? { ciphertext: encryptedPhone.ciphertext, lastFour: phone!.slice(-4) }
      : null,
    givenName: encryptedName?.ciphertext ?? null,
    keyVersion: (encryptedPhone ?? encryptedName)!.keyVersion,
    expiresAt: new Date(now.getTime() + CUSTOMER_PII_RETENTION_MS),
  };
}

async function storeContact(
  tx: Transaction,
  merchantId: string,
  customerId: string,
  contact: EncryptedContact,
  now: Date,
): Promise<void> {
  const values = {
    encryptedPhoneE164: contact.phone?.ciphertext ?? null,
    phoneLastFour: contact.phone?.lastFour ?? null,
    encryptedGivenName: contact.givenName,
    keyVersion: contact.keyVersion,
    expiresAt: contact.expiresAt,
    deletedAt: null,
  };
  await tx
    .insert(customerPrivate)
    .values({ customerId, merchantId, ...values })
    .onConflictDoUpdate({
      target: customerPrivate.customerId,
      set: { ...values, updatedAt: now },
      where: eq(customerPrivate.merchantId, merchantId),
    });
  // A suppressed (opted-out) customer stays suppressed whatever they order.
  await tx
    .update(customers)
    .set({
      contactabilityStatus: contact.phone ? "eligible" : "no_phone",
      updatedAt: now,
    })
    .where(
      and(
        eq(customers.merchantId, merchantId),
        eq(customers.id, customerId),
        ne(customers.contactabilityStatus, "suppressed"),
      ),
    );
}

async function upsertCustomer(
  tx: Transaction,
  merchantId: string,
  installedAt: Date | null,
  input: { shopifyCustomerId: string; createdAt: string | null },
): Promise<{ id: string; history: HistoryCompleteness }> {
  const observedComplete =
    installedAt !== null &&
    input.createdAt !== null &&
    new Date(input.createdAt) >= installedAt;
  const candidate: HistoryCompleteness = observedComplete
    ? {
        state: "complete",
        historyStartAt: installedAt.toISOString(),
        reason: "full_import",
      }
    : {
        state: "partial",
        historyStartAt: installedAt?.toISOString() ?? null,
        reason: "import_pending",
      };
  await tx
    .insert(customers)
    .values({
      id: customerIdFor(merchantId, input.shopifyCustomerId),
      merchantId,
      shopifyCustomerId: input.shopifyCustomerId,
      historyCompleteness: candidate,
    })
    .onConflictDoNothing({
      target: [customers.merchantId, customers.shopifyCustomerId],
    });
  const [row] = await tx
    .select({
      id: customers.id,
      historyCompleteness: customers.historyCompleteness,
    })
    .from(customers)
    .where(
      and(
        eq(customers.merchantId, merchantId),
        eq(customers.shopifyCustomerId, input.shopifyCustomerId),
      ),
    );
  if (!row) throw new Error("SHOPIFY_CUSTOMER_UNRESOLVED");
  return {
    id: row.id,
    history: row.historyCompleteness as HistoryCompleteness,
  };
}

async function countPriorOrders(
  tx: Transaction,
  merchantId: string,
  customerId: string,
  orderId: string,
  orderedAt: Date,
): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.customerId, customerId),
        ne(orders.id, orderId),
        lt(orders.orderedAt, orderedAt),
      ),
    );
  return row?.count ?? 0;
}

async function upsertProduct(
  tx: Transaction,
  merchantId: string,
  shopifyProductId: string,
  title: string,
  now: Date,
): Promise<string> {
  const [row] = await tx
    .insert(products)
    .values({
      id: stableUuid(`shopify-product:${merchantId}:${shopifyProductId}`),
      merchantId,
      shopifyProductId,
      title,
    })
    .onConflictDoUpdate({
      target: [products.merchantId, products.shopifyProductId],
      set: { updatedAt: now },
    })
    .returning({ id: products.id });
  if (!row) throw new Error("SHOPIFY_PRODUCT_UNRESOLVED");
  return row.id;
}

async function refreshCustomerTotals(
  tx: Transaction,
  merchantId: string,
  customerId: string,
  now: Date,
): Promise<void> {
  // Lifetime revenue only sums orders in the customer's latest currency.
  await tx.execute(sql`
    with customer_orders as (
      select total_minor, currency, ordered_at
      from orders
      where merchant_id = ${merchantId} and customer_id = ${customerId}
    ), latest as (
      select currency from customer_orders order by ordered_at desc limit 1
    )
    update customers c set
      order_count = (select count(*)::int from customer_orders),
      lifetime_revenue_minor = (
        select coalesce(sum(total_minor), 0) from customer_orders
        where currency = (select currency from latest)
      ),
      currency = (select currency from latest),
      first_order_at = (select min(ordered_at) from customer_orders),
      latest_order_at = (select max(ordered_at) from customer_orders),
      updated_at = ${now}
    where c.merchant_id = ${merchantId} and c.id = ${customerId}
  `);
}
