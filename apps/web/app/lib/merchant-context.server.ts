import { randomUUID } from "node:crypto";

import { getShopifyApp } from "../shopify.server";
import type { TenantContext } from "./operations-types";
import { shopifyMerchantId, stableUuid } from "./shopify-ingestion.server";

/**
 * Authenticates a Shopify admin request and builds the merchant viewer's
 * context: the shop's own merchant, no workforce roles. Audit events record
 * the shop's stable actor ID.
 */
export async function authenticateMerchant(request: Request) {
  const auth = await getShopifyApp().authenticate.admin(request);
  const merchantId = shopifyMerchantId(auth.session.shop);
  const context: TenantContext = {
    merchantId,
    merchantIds: [merchantId],
    researcherId: stableUuid(
      `shopify-admin:${auth.session.shop.toLowerCase()}`,
    ),
    correlationId: randomUUID(),
    roles: [],
    viewer: "merchant",
  };
  return { ...auth, context };
}
