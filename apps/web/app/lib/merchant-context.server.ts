import { randomUUID } from "node:crypto";

import { getShopifyApp } from "../shopify.server";
import {
  MERCHANT_PORTAL_PATH,
  authenticatePortalMerchant,
} from "./merchant-portal-auth.server";
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

export function isMerchantPortalPath(pathname: string): boolean {
  return (
    pathname === MERCHANT_PORTAL_PATH ||
    pathname.startsWith(`${MERCHANT_PORTAL_PATH}/`)
  );
}

/**
 * The merchant viewer for pages shared by both merchant surfaces. Pages under
 * /portal authenticate with a Google portal session; pages under /app with
 * Shopify admin. Either way the viewer gets the same merchant-only context.
 */
export async function authenticateMerchantViewer(
  request: Request,
): Promise<{ context: TenantContext }> {
  if (isMerchantPortalPath(new URL(request.url).pathname))
    return authenticatePortalMerchant(request);
  return authenticateMerchant(request);
}
