import { assertOperationalJobPayload } from "@holler/db";
import { describe, expect, it } from "vitest";

describe("outbox payload safety", () => {
  it.each([
    "phone",
    "email",
    "customerName",
    "address",
    "transcriptContent",
    "responseValue",
    "notes",
    "rawBody",
    "accessToken",
    "signedUrl",
    "encryptedGivenName",
  ])("rejects forbidden key %s at any nesting depth", (key) => {
    expect(() =>
      assertOperationalJobPayload({ safe: { [key]: "sensitive" } }),
    ).toThrow("JOB_PAYLOAD_FORBIDDEN_KEY");
  });

  it("accepts opaque identifiers", () => {
    expect(() =>
      assertOperationalJobPayload({
        merchantId: "11111111-1111-4111-8111-111111111111",
        receiptId: "22222222-2222-4222-8222-222222222222",
      }),
    ).not.toThrow();
  });
});
