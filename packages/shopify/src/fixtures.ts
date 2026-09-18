import type { ShopifyOrderIngressV1 } from "./ingress";

const DEFAULT_OCCURRED_AT = "2026-09-17T14:00:00.000Z";

export const syntheticShopifyIds = {
  order: "gid://shopify/Order/900000000001",
  customer: "gid://shopify/Customer/900000000002",
  lineItem: "gid://shopify/LineItem/900000000003",
  product: "gid://shopify/Product/900000000004",
  variant: "gid://shopify/ProductVariant/900000000005",
} as const;

export interface SyntheticShopifyOrderOverrides {
  readonly webhookId?: string;
  readonly eventId?: string | null;
  readonly shopDomain?: string;
  readonly customer?: ShopifyOrderIngressV1["order"]["customer"];
  readonly observedAttribution?: Partial<
    ShopifyOrderIngressV1["order"]["observedAttribution"]
  >;
}

/** Builds fictional allowlisted ingress data, never a captured merchant payload. */
export function buildSyntheticShopifyOrderIngress(
  overrides: SyntheticShopifyOrderOverrides = {},
): ShopifyOrderIngressV1 {
  const observedAttribution = {
    schemaVersion: 1 as const,
    readiness: "ready" as const,
    source: "meta",
    channel: "paid_social",
    campaign: "synthetic-autumn-launch",
    referringDomain: "social.example",
    landingPath: "/products/travel-kit",
    utm: {
      source: "meta",
      medium: "paid_social",
      campaign: "synthetic-autumn-launch",
      content: null,
      term: null,
    },
    observedAt: DEFAULT_OCCURRED_AT,
    ...overrides.observedAttribution,
  };

  return {
    schemaVersion: 1,
    webhookId: overrides.webhookId ?? "00000000-0000-4000-8000-000000000001",
    eventId:
      overrides.eventId === undefined
        ? "00000000-0000-4000-8000-000000000101"
        : overrides.eventId,
    shopDomain: overrides.shopDomain ?? "holler-synthetic.myshopify.com",
    apiVersion: "2026-07",
    triggeredAt: DEFAULT_OCCURRED_AT,
    order: {
      id: syntheticShopifyIds.order,
      createdAt: DEFAULT_OCCURRED_AT,
      updatedAt: DEFAULT_OCCURRED_AT,
      cancelledAt: null,
      test: true,
      financialStatus: "paid",
      fulfillmentStatus: null,
      total: { amount: "128.00", currency: "USD" },
      customer:
        overrides.customer === undefined
          ? {
              id: syntheticShopifyIds.customer,
              phone: "+12025550123",
              firstName: "Synthetic",
            }
          : overrides.customer,
      lineItems: [
        {
          id: syntheticShopifyIds.lineItem,
          productId: syntheticShopifyIds.product,
          variantId: syntheticShopifyIds.variant,
          sku: "SYN-TRAVEL-001",
          title: "Synthetic Travel Kit",
          quantity: 1,
          unitPrice: { amount: "128.00", currency: "USD" },
        },
      ],
      observedAttribution,
    },
  };
}
