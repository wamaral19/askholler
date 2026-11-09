import { createHmac, timingSafeEqual } from "node:crypto";

import { merchants, type HollerDatabase } from "@holler/db";
import { eq } from "drizzle-orm";

import {
  recordShopifyInstall,
  shopifyMerchantId,
  stableUuid,
} from "./shopify-ingestion.server";

/**
 * Store webhooks are created by a merchant in Shopify admin (Settings →
 * Notifications → Webhooks) rather than by an app. Shopify signs them with a
 * key specific to that store, shown on the same page. Keys live in
 * SHOPIFY_STORE_WEBHOOK_KEYS as a JSON object of shop domain to key, e.g.
 * {"example.myshopify.com":"abc123"}.
 */
export function parseStoreWebhookKeys(
  value: string | undefined,
): Map<string, string> {
  if (!value?.trim()) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("SHOPIFY_STORE_WEBHOOK_KEYS must be a JSON object");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("SHOPIFY_STORE_WEBHOOK_KEYS must be a JSON object");
  const keys = new Map<string, string>();
  for (const [shop, key] of Object.entries(parsed)) {
    const domain = shop.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))
      throw new Error(
        `SHOPIFY_STORE_WEBHOOK_KEYS has an invalid shop domain: ${shop}`,
      );
    if (typeof key !== "string" || !key.trim())
      throw new Error(`SHOPIFY_STORE_WEBHOOK_KEYS has no key for ${domain}`);
    keys.set(domain, key.trim());
  }
  return keys;
}

let cached: { source: string | undefined; keys: Map<string, string> } | null =
  null;
export function getStoreWebhookKeys(): Map<string, string> {
  const source = process.env.SHOPIFY_STORE_WEBHOOK_KEYS;
  if (!cached || cached.source !== source)
    cached = { source, keys: parseStoreWebhookKeys(source) };
  return cached.keys;
}

/** Shopify's X-Shopify-Hmac-Sha256: base64 HMAC-SHA256 of the raw body. */
export function verifyShopifyWebhookHmac(
  body: Uint8Array,
  header: string | null,
  key: string,
): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", key).update(body).digest();
  const given = Buffer.from(header, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Delivery IDs dedupe redeliveries. A non-UUID (or missing) header is mapped to
 * a stable UUID, falling back to the body hash, which a retry repeats exactly.
 */
export function storeDeliveryId(
  shopDomain: string,
  header: string | null,
  bodySha256: string,
): string {
  if (header && UUID.test(header)) return header.toLowerCase();
  return stableUuid(
    `shopify-store-delivery:${shopDomain}:${header || bodySha256}`,
  );
}

export function storeEventId(header: string | null): string | null {
  return header && UUID.test(header) ? header.toLowerCase() : null;
}

/**
 * A store's first verified delivery stands in for an install: Holler sees every
 * order from then on, which is what history completeness relies on. Existing
 * active merchants keep their install time.
 */
export async function ensureStoreMerchant(
  db: HollerDatabase,
  shopDomain: string,
): Promise<void> {
  const [merchant] = await db
    .select({ status: merchants.status, installedAt: merchants.installedAt })
    .from(merchants)
    .where(eq(merchants.id, shopifyMerchantId(shopDomain)));
  if (merchant?.status !== "active" || merchant.installedAt === null)
    await recordShopifyInstall(db, shopDomain);
}
