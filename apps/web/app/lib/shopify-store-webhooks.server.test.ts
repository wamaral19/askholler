import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  parseStoreWebhookKeys,
  storeDeliveryId,
  storeEventId,
  verifyShopifyWebhookHmac,
} from "./shopify-store-webhooks.server";

describe("store webhook verification", () => {
  it("parses shop keys and refuses malformed configuration", () => {
    expect(
      parseStoreWebhookKeys('{"Example-Shop.myshopify.com":" key-1 "}'),
    ).toEqual(new Map([["example-shop.myshopify.com", "key-1"]]));
    expect(parseStoreWebhookKeys(undefined).size).toBe(0);
    expect(() => parseStoreWebhookKeys("example.myshopify.com=key")).toThrow(
      /JSON object/,
    );
    expect(() => parseStoreWebhookKeys('{"example.com":"key"}')).toThrow(
      /invalid shop domain/,
    );
    expect(() => parseStoreWebhookKeys('{"example.myshopify.com":""}')).toThrow(
      /no key/,
    );
  });

  it("accepts only the body signed with the store's key", () => {
    const body = new TextEncoder().encode('{"id":1}');
    const signature = createHmac("sha256", "store-key")
      .update(body)
      .digest("base64");
    expect(verifyShopifyWebhookHmac(body, signature, "store-key")).toBe(true);
    expect(verifyShopifyWebhookHmac(body, signature, "other-key")).toBe(false);
    expect(
      verifyShopifyWebhookHmac(
        new TextEncoder().encode('{"id":2}'),
        signature,
        "store-key",
      ),
    ).toBe(false);
    expect(verifyShopifyWebhookHmac(body, null, "store-key")).toBe(false);
    expect(verifyShopifyWebhookHmac(body, "short", "store-key")).toBe(false);
  });

  it("gives redeliveries the same delivery ID whatever the header holds", () => {
    const uuid = "6F1C2D3E-4A5B-4C6D-8E7F-112233445566";
    expect(storeDeliveryId("a.myshopify.com", uuid, "sha")).toBe(
      uuid.toLowerCase(),
    );
    const fromHeader = storeDeliveryId("a.myshopify.com", "12345", "sha");
    expect(fromHeader).toBe(storeDeliveryId("a.myshopify.com", "12345", "x"));
    expect(fromHeader).not.toBe(
      storeDeliveryId("b.myshopify.com", "12345", "sha"),
    );
    expect(storeDeliveryId("a.myshopify.com", null, "sha")).toBe(
      storeDeliveryId("a.myshopify.com", "", "sha"),
    );
    expect(storeEventId("12345")).toBeNull();
    expect(storeEventId(uuid)).toBe(uuid.toLowerCase());
  });
});
