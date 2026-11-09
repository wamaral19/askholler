import {
  mapShopifyOrderWebhook,
  type ShopifyOrderWebhookInput,
} from "@holler/shopify";
import { ZodError } from "zod";

import { getCustomerPrivateCipher } from "./customer-private.server";
import {
  applyShopifyOrderUpdate,
  getShopifyIngestionDatabase,
  ingestShopifyOrder,
} from "./shopify-ingestion.server";

/** Where a verified order delivery came from: the app, or a store's own webhook. */
export type ShopifyOrderDeliverySource = "app" | "store";

/**
 * Ingests a verified `orders/create` or `orders/updated` delivery. Failures
 * propagate so the caller answers 500 and Shopify redelivers; the delivery ID
 * dedupe and stable identities make the retry safe. Updates refresh refunds
 * and status only; they never queue an order.
 */
export async function processShopifyOrderDelivery(
  input: ShopifyOrderWebhookInput & {
    topic: "orders/create" | "orders/updated";
    bodySha256: string;
    source: ShopifyOrderDeliverySource;
  },
): Promise<void> {
  let ingress;
  try {
    ingress = mapShopifyOrderWebhook(input);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    // An authenticated but unusable order will not improve on retry. Issue
    // paths name fields, never their values.
    console.warn(
      JSON.stringify({
        event: "shopify.order_webhook_rejected",
        source: input.source,
        webhookId: input.webhookId,
        issues: error.issues.map((issue) => issue.path.join(".")),
      }),
    );
    return;
  }
  const db = getShopifyIngestionDatabase();
  const result =
    input.topic === "orders/create"
      ? await ingestShopifyOrder(
          db,
          ingress,
          input.bodySha256,
          new Date(),
          getCustomerPrivateCipher(),
        )
      : await applyShopifyOrderUpdate(db, ingress, input.bodySha256);
  console.info(
    JSON.stringify({
      event: "shopify.order_webhook_ingested",
      source: input.source,
      webhookId: input.webhookId,
      merchantId: result.merchantId,
      outcome: result.outcome,
    }),
  );
}
