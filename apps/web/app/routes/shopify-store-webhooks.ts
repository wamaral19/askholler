import { createHash } from "node:crypto";

import type { ActionFunctionArgs } from "react-router";

import { getShopifyIngestionDatabase } from "../lib/shopify-ingestion.server";
import { processShopifyOrderDelivery } from "../lib/shopify-order-delivery.server";
import {
  ensureStoreMerchant,
  getStoreWebhookKeys,
  storeDeliveryId,
  storeEventId,
  verifyShopifyWebhookHmac,
} from "../lib/shopify-store-webhooks.server";

const STORE_WEBHOOK_FALLBACK_API_VERSION = "2026-10";

/**
 * Receives order webhooks a merchant created in their own Shopify admin, with
 * no app installed. Verified with that store's signing key from
 * SHOPIFY_STORE_WEBHOOK_KEYS; unknown stores and bad signatures get 401.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const body = new Uint8Array(await request.arrayBuffer());
  const shopDomain =
    request.headers.get("x-shopify-shop-domain")?.trim().toLowerCase() ?? "";
  const key = getStoreWebhookKeys().get(shopDomain);
  if (
    !key ||
    !verifyShopifyWebhookHmac(
      body,
      request.headers.get("x-shopify-hmac-sha256"),
      key,
    )
  ) {
    console.warn(
      JSON.stringify({
        event: "shopify.store_webhook_unauthorized",
        knownShop: key !== undefined,
      }),
    );
    return new Response(null, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic");
  if (topic !== "orders/create" && topic !== "orders/updated")
    return new Response(null, { status: 200 });

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    // The store's format is XML, or the body is corrupt; neither improves on retry.
    console.warn(
      JSON.stringify({ event: "shopify.store_webhook_not_json", topic }),
    );
    return new Response(null, { status: 200 });
  }

  const bodySha256 = createHash("sha256").update(body).digest("hex");
  await ensureStoreMerchant(getShopifyIngestionDatabase(), shopDomain);
  await processShopifyOrderDelivery({
    topic,
    source: "store",
    bodySha256,
    webhookId: storeDeliveryId(
      shopDomain,
      request.headers.get("x-shopify-webhook-id"),
      bodySha256,
    ),
    eventId: storeEventId(request.headers.get("x-shopify-event-id")),
    shopDomain,
    // Recorded only, never used to read the payload, so a missing or odd
    // header must not drop the order.
    apiVersion: /^20[0-9]{2}-(01|04|07|10)$/.test(
      request.headers.get("x-shopify-api-version") ?? "",
    )
      ? request.headers.get("x-shopify-api-version")!
      : STORE_WEBHOOK_FALLBACK_API_VERSION,
    triggeredAt:
      request.headers.get("x-shopify-triggered-at") ?? new Date().toISOString(),
    payload,
  });
  return new Response(null, { status: 200 });
}
