import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { mapShopifyOrderWebhook, moneyToMinor } from "./webhook-order";

/** Fictional REST-shaped payload including fields Holler must drop. */
function restPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 900000000701,
    admin_graphql_api_id: "gid://shopify/Order/900000000701",
    created_at: "2026-09-28T10:00:00-04:00",
    updated_at: "2026-09-28T10:00:01-04:00",
    cancelled_at: null,
    test: true,
    financial_status: "paid",
    fulfillment_status: null,
    currency: "USD",
    total_price: "42.50",
    email: "synthetic@example.invalid",
    note: "leave at door",
    shipping_address: { address1: "1 Example St" },
    landing_site:
      "/products/travel-kit?utm_source=meta&utm_medium=paid_social&utm_campaign=fall",
    referring_site: "https://l.instagram.com/some/path",
    customer: {
      id: 900000000702,
      admin_graphql_api_id: "gid://shopify/Customer/900000000702",
      email: "synthetic@example.invalid",
      phone: "+12025550188",
      first_name: "Synthetic",
      last_name: "Shopper",
      created_at: "2026-09-28T09:58:00-04:00",
    },
    line_items: [
      {
        id: 900000000703,
        admin_graphql_api_id: "gid://shopify/LineItem/900000000703",
        product_id: 900000000704,
        variant_id: 900000000705,
        sku: "",
        title: "Travel kit",
        quantity: 1,
        price: "42.50",
      },
    ],
    ...overrides,
  };
}

const delivery = {
  webhookId: "11111111-1111-4111-8111-111111111111",
  eventId: null,
  shopDomain: "holler-dev.myshopify.com",
  apiVersion: "2026-10",
  triggeredAt: "2026-09-28T14:00:02.000Z",
};

describe("mapShopifyOrderWebhook", () => {
  it("maps a REST order into the allowlisted envelope", () => {
    const ingress = mapShopifyOrderWebhook({
      ...delivery,
      payload: restPayload(),
    });

    expect(ingress.order).toMatchObject({
      id: "gid://shopify/Order/900000000701",
      createdAt: "2026-09-28T14:00:00.000Z",
      test: true,
      total: { amount: "42.50", currency: "USD" },
      customer: {
        id: "gid://shopify/Customer/900000000702",
        createdAt: "2026-09-28T13:58:00.000Z",
      },
      lineItems: [
        {
          productId: "gid://shopify/Product/900000000704",
          variantId: "gid://shopify/ProductVariant/900000000705",
          sku: null,
        },
      ],
      observedAttribution: {
        readiness: "ready",
        source: "meta",
        channel: "paid_social",
        campaign: "fall",
        referringDomain: "l.instagram.com",
        landingPath: "/products/travel-kit",
      },
    });
    const serialized = JSON.stringify(ingress);
    expect(serialized).not.toContain("example.invalid");
    expect(serialized).not.toContain("Shopper");
    expect(serialized).not.toContain("leave at door");
    expect(serialized).not.toContain("Example St");
  });

  it("supports guest orders without attribution", () => {
    const ingress = mapShopifyOrderWebhook({
      ...delivery,
      payload: restPayload({
        customer: null,
        landing_site: null,
        referring_site: null,
      }),
    });

    expect(ingress.order.customer).toBeNull();
    expect(ingress.order.observedAttribution).toMatchObject({
      readiness: "unavailable",
      utm: null,
      landingPath: null,
    });
  });

  it("rejects payloads that are not orders", () => {
    expect(() =>
      mapShopifyOrderWebhook({ ...delivery, payload: { id: 1 } }),
    ).toThrow(ZodError);
  });
});

describe("moneyToMinor", () => {
  it("respects currency precision", () => {
    expect(moneyToMinor("42.50", "USD")).toBe(4250);
    expect(moneyToMinor("7", "USD")).toBe(700);
    expect(moneyToMinor("1200", "JPY")).toBe(1200);
    expect(() => moneyToMinor("1.005", "USD")).toThrow();
  });
});
