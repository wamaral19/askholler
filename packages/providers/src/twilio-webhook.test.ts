import { describe, expect, it } from "vitest";
import { createTwilioVoiceToken } from "./twilio-access-token";
import { verifyTwilioWebhookSignature } from "./twilio-webhook";

describe("Twilio webhook signatures", () => {
  it("accepts Twilio's documented validation vector and rejects tampering", async () => {
    const input = {
      authToken: "12345",
      url: "https://mycompany.com/myapp.php?foo=1&bar=2",
      signature: "GvWf1cFY/Q7PnoempGyD5oXAezc=",
      parameters: new URLSearchParams([
        ["CallSid", "CA1234567890ABCDE"],
        ["Caller", "+14158675310"],
        ["Digits", "1234"],
        ["From", "+14158675310"],
        ["To", "+18005551212"],
      ]),
    };
    await expect(verifyTwilioWebhookSignature(input)).resolves.toBe(true);
    await expect(
      verifyTwilioWebhookSignature({
        ...input,
        url: `${input.url}&tampered=1`,
      }),
    ).resolves.toBe(false);
  });
});

describe("Twilio voice access tokens", () => {
  it("creates a short-lived outgoing-only token with opaque identity", async () => {
    const token = await createTwilioVoiceToken(
      {
        accountSid: `AC${"a".repeat(32)}`,
        apiKeySid: `SK${"b".repeat(32)}`,
        apiKeySecret: "secret",
        outgoingApplicationSid: `AP${"c".repeat(32)}`,
        now: () => 1_700_000_000_000,
        randomId: () => "test",
      },
      { identity: "researcher_123" },
    );
    const [, encodedPayload] = token.split(".");
    const payload = JSON.parse(
      atob((encodedPayload ?? "").replace(/-/g, "+").replace(/_/g, "/")),
    ) as {
      exp: number;
      iat: number;
      grants: Record<string, unknown>;
    };
    expect(payload.exp - payload.iat).toBe(300);
    expect(payload.grants).toMatchObject({
      identity: "researcher_123",
      voice: { outgoing: { application_sid: `AP${"c".repeat(32)}` } },
    });
    expect(JSON.stringify(payload.grants)).not.toContain("incoming");
  });
});
