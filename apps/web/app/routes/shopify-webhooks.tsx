import { createHash } from "node:crypto";

import { mapShopifyOrderWebhook } from "@holler/shopify";
import type { ActionFunctionArgs } from "react-router";
import { ZodError } from "zod";

import {
  applyShopifyChargeStatus,
  resetChargesOnUninstall,
} from "../lib/merchant-billing.server";
import {
  applyShopifyOrderUpdate,
  getShopifyIngestionDatabase as getDatabase,
  ingestShopifyOrder,
  recordShopifyPrivacyRequest,
  recordShopifyUninstall,
  shopifyMerchantId,
} from "../lib/shopify-ingestion.server";
import { getCustomerPrivateCipher } from "../lib/customer-private.server";
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
    await resetChargesOnUninstall(getDatabase(), shopifyMerchantId(shop));
  }

  if (
    topic === "APP_SUBSCRIPTIONS_UPDATE" ||
    topic === "APP_PURCHASES_ONE_TIME_UPDATE"
  ) {
    const payload = context.payload as Record<string, unknown>;
    const charge = (payload.app_subscription ??
      payload.app_purchase_one_time) as Record<string, unknown> | undefined;
    const id = charge?.admin_graphql_api_id;
    const status = charge?.status;
    if (typeof id === "string" && typeof status === "string")
      await applyShopifyChargeStatus(
        getDatabase(),
        shopifyMerchantId(shop),
        id,
        status,
      );
    console.info(
      JSON.stringify({
        event: "shopify.billing_webhook",
        topic,
        webhookId: context.webhookId,
      }),
    );
  }

  if (
    topic === "CUSTOMERS_REDACT" ||
    topic === "SHOP_REDACT" ||
    topic === "CUSTOMERS_DATA_REQUEST"
  ) {
    // Recorded here, executed by the worker's hourly privacy sweep.
    const outcome = await recordShopifyPrivacyRequest(
      getDatabase(),
      shop,
      topic,
      context.payload,
    );
    // Data requests are answered by an operator (see the security runbook).
    const log =
      topic === "CUSTOMERS_DATA_REQUEST" && outcome === "recorded"
        ? console.error
        : console.info;
    log(
      JSON.stringify({
        event: "shopify.privacy_webhook",
        topic,
        webhookId: context.webhookId,
        outcome,
      }),
    );
  }

  if (topic === "ORDERS_CREATE" || topic === "ORDERS_UPDATED") {
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
    // and stable identities make the retry safe. Updates refresh refunds and
    // status only; they never queue an order.
    const result =
      topic === "ORDERS_CREATE"
        ? await ingestShopifyOrder(
            getDatabase(),
            ingress,
            bodySha256,
            new Date(),
            getCustomerPrivateCipher(),
          )
        : await applyShopifyOrderUpdate(getDatabase(), ingress, bodySha256);
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
