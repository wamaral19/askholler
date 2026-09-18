import { describe, expect, it } from "vitest";
import { commerceEventIdentity } from "./commerce";

describe("commerceEventIdentity", () => {
  it("maps duplicate deliveries of the same source event to one identity", () => {
    const input = {
      merchantId: "018f2df0-4a40-7000-8000-000000000001",
      source: "synthetic" as const,
      sourceEventId: "order-2002",
    };

    expect(commerceEventIdentity(input)).toBe(
      commerceEventIdentity({ ...input }),
    );
  });

  it("separates merchants and source events", () => {
    const base = {
      merchantId: "018f2df0-4a40-7000-8000-000000000001",
      source: "synthetic" as const,
      sourceEventId: "order-2002",
    };

    expect(commerceEventIdentity(base)).not.toBe(
      commerceEventIdentity({ ...base, sourceEventId: "order-2003" }),
    );
  });
});
