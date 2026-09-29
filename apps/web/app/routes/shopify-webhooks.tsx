import { createHash } from "node:crypto";

import { mapShopifyOrderWebhook } from "@holler/shopify";
import type { ActionFunctionArgs } from "react-router";
import { ZodError } from "zod";

import {
  getShopifyIngestionDatabase as getDatabase,
  ingestShopifyOrder,
  recordShopifyUninstall,
} from "../lib/shopify-ingestion.server";
import { getShopifyApp } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  // Hash the exact bytes before authenticate.webhook consumes the body.
  const bodySha256 = createHash("sha256")
    .update(Buffer.from(await request.clone().arrayBuffer()))
    .digest("hex");
  const shopify = getShopifyApp();
  const context = await shopify.authenticate.webhook(request);
  const { shop, topic } = context;

  if (topic === "APP_UNINSTALLED") {
    const sessions = await shopify.sessionStorage.findSessionsByShop(shop);
    if (sessions.length > 0) {
      await shopify.sessionStorage.deleteSessions(
        sessions.map((session) => session.id),
      );
    }
    await recordShopifyUninstall(getDatabase(), shop);
  }

  if (topic === "ORDERS_CREATE") {
    let ingress;
    try {
      ingress = mapShopifyOrderWebhook({
        webhookId: context.webhookId,
        eventId: context.eventId ?? null,
        shopDomain: shop,
        apiVersion: context.apiVersion,
        triggeredAt: context.triggeredAt ?? new Date().toISOString(),
        payload: context.payload,
      });
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      // An authenticated but unusable order will not improve on retry.
      console.warn(
        JSON.stringify({
          event: "shopify.order_webhook_rejected",
          webhookId: context.webhookId,
        }),
      );
      return new Response(null, { status: 200 });
    }
    // Failures propagate as 500 so Shopify redelivers; the delivery ID dedupe
    // and stable identities make the retry safe.
    const result = await ingestShopifyOrder(getDatabase(), ingress, bodySha256);
    console.info(
      JSON.stringify({
        event: "shopify.order_webhook_ingested",
        webhookId: context.webhookId,
        merchantId: result.merchantId,
        outcome: result.outcome,
      }),
    );
  }

  return new Response(null, { status: 200 });
}
