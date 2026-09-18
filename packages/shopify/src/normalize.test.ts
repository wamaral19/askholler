import { describe, expect, it } from "vitest";

import { buildSyntheticShopifyOrderIngress } from "./fixtures";
import { shopifyOrderIngressV1Schema } from "./ingress";
import {
  normalizeShopifyOrderIngress,
  type ShopifyOrderNormalizationContext,
} from "./normalize";

const context: ShopifyOrderNormalizationContext = {
  merchantId: "00000000-0000-4000-8000-000000000201",
  orderId: "00000000-0000-4000-8000-000000000202",
  customerId: "00000000-0000-4000-8000-000000000203",
  customerOrderSequence: 2,
  historyCompleteness: {
    state: "complete",
    historyStartAt: "2025-01-01T00:00:00.000Z",
    reason: "full_import",
  },
  catalogEnrichment: {
    state: "ready",
    refreshedAt: "2026-09-17T13:55:00.000Z",
  },
};

describe("normalizeShopifyOrderIngress", () => {
  it("uses the semantic order fact for identity across duplicate deliveries", () => {
    const first = normalizeShopifyOrderIngress(
      buildSyntheticShopifyOrderIngress(),
      context,
    );
    const retry = normalizeShopifyOrderIngress(
      buildSyntheticShopifyOrderIngress({
        webhookId: "00000000-0000-4000-8000-000000000002",
        eventId: "00000000-0000-4000-8000-000000000102",
      }),
      context,
    );

    expect(retry.identity).toBe(first.identity);
    expect(retry.event.sourceEventId).toBe(first.event.sourceEventId);
  });

  it("supports a known customer with no phone", () => {
    const ingress = buildSyntheticShopifyOrderIngress({
      customer: {
        id: "gid://shopify/Customer/900000000002",
        phone: null,
        firstName: "Synthetic",
      },
    });

    expect(
      shopifyOrderIngressV1Schema.parse(ingress).order.customer?.phone,
    ).toBeNull();
    expect(
      normalizeShopifyOrderIngress(ingress, context).event.customerId,
    ).toBe(context.customerId);
  });

  it("normalizes a guest order without inventing customer history", () => {
    const ingress = buildSyntheticShopifyOrderIngress({ customer: null });
    const guestContext: ShopifyOrderNormalizationContext = {
      ...context,
      customerId: null,
      customerOrderSequence: null,
      historyCompleteness: {
        state: "unknown",
        historyStartAt: null,
        reason: "guest_customer",
      },
    };

    const normalized = normalizeShopifyOrderIngress(ingress, guestContext);
    expect(normalized.event.customerId).toBeNull();
    expect(normalized.event.customerOrderSequence).toBeNull();
  });

  it("preserves pending observed attribution", () => {
    const ingress = buildSyntheticShopifyOrderIngress({
      observedAttribution: {
        readiness: "pending",
        source: null,
        channel: null,
        campaign: null,
        referringDomain: null,
        landingPath: null,
        utm: null,
      },
    });

    const normalized = normalizeShopifyOrderIngress(ingress, context);
    expect(normalized.event.observedAttribution.readiness).toBe("pending");
    expect(normalized.event.observedAttribution.source).toBeNull();
  });

  it("preserves pending catalog enrichment for deferred category qualification", () => {
    const pendingContext: ShopifyOrderNormalizationContext = {
      ...context,
      catalogEnrichment: { state: "pending", refreshedAt: null },
    };

    const normalized = normalizeShopifyOrderIngress(
      buildSyntheticShopifyOrderIngress(),
      pendingContext,
    );
    expect(normalized.event.catalogEnrichment).toEqual({
      state: "pending",
      refreshedAt: null,
    });
  });

  it("rejects extra sensitive fields from the reduced ingress envelope", () => {
    const ingress = buildSyntheticShopifyOrderIngress();
    const customerWithEmail = {
      ...ingress.order.customer,
      email: "not-allowed@example.test",
    };
    const result = shopifyOrderIngressV1Schema.safeParse({
      ...ingress,
      order: { ...ingress.order, customer: customerWithEmail },
    });
    expect(result.success).toBe(false);
  });
});
