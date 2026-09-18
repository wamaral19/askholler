import {
  catalogEnrichmentSchema,
  commerceEventIdentity,
  commerceEventV1Schema,
  historyCompletenessSchema,
  type CommerceEventV1,
} from "@holler/domain";
import { z } from "zod";

import {
  shopifyOrderIngressV1Schema,
  type ShopifyOrderIngressV1,
} from "./ingress";

export const shopifyOrderNormalizationContextSchema = z
  .object({
    merchantId: z.string().uuid(),
    orderId: z.string().uuid(),
    customerId: z.string().uuid().nullable(),
    customerOrderSequence: z.number().int().positive().nullable(),
    historyCompleteness: historyCompletenessSchema,
    catalogEnrichment: catalogEnrichmentSchema,
  })
  .strict();

export type ShopifyOrderNormalizationContext = z.infer<
  typeof shopifyOrderNormalizationContextSchema
>;

export interface NormalizedShopifyCommerceEvent {
  readonly event: CommerceEventV1;
  readonly identity: string;
}

function assertCustomerMapping(
  ingress: ShopifyOrderIngressV1,
  context: ShopifyOrderNormalizationContext,
): void {
  const hasShopifyCustomer = ingress.order.customer !== null;
  const hasInternalCustomer = context.customerId !== null;

  if (hasShopifyCustomer !== hasInternalCustomer) {
    throw new Error(
      "Shopify customer presence must match the resolved internal customer ID",
    );
  }

  if (!hasShopifyCustomer) {
    if (context.customerOrderSequence !== null) {
      throw new Error("Guest orders cannot have a customer order sequence");
    }
    if (context.historyCompleteness.reason !== "guest_customer") {
      throw new Error(
        "Guest orders require guest_customer history completeness",
      );
    }
  }
}

/**
 * Produces a provider-neutral event input. Delivery IDs are deliberately not
 * part of source identity: retries and separate deliveries for the same
 * Shopify order-created fact normalize to the same event identity.
 */
export function normalizeShopifyOrderIngress(
  ingressInput: ShopifyOrderIngressV1,
  contextInput: ShopifyOrderNormalizationContext,
): NormalizedShopifyCommerceEvent {
  const ingress = shopifyOrderIngressV1Schema.parse(ingressInput);
  const context = shopifyOrderNormalizationContextSchema.parse(contextInput);
  assertCustomerMapping(ingress, context);

  const event = commerceEventV1Schema.parse({
    schemaVersion: 1,
    merchantId: context.merchantId,
    source: "shopify_webhook",
    sourceEventId: `orders/create:${ingress.order.id}`,
    eventType: "order_completed",
    customerId: context.customerId,
    orderId: context.orderId,
    customerOrderSequence: context.customerOrderSequence,
    occurredAt: ingress.order.createdAt,
    historyCompleteness: context.historyCompleteness,
    catalogEnrichment: context.catalogEnrichment,
    observedAttribution: ingress.order.observedAttribution,
  });

  return { event, identity: commerceEventIdentity(event) };
}
