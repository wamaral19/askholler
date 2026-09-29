import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { CustomerPrivateCipher } from "./customer-private-cipher";
import { EnvelopeEncryptionService } from "./envelope-encryption";
import { GcpKmsDataKeyProvider } from "./gcp-kms-data-key-provider";

const keyId =
  "projects/holler-staging/locations/us/keyRings/pii/cryptoKeys/customer-data";

/** Stands in for the Cloud KMS REST API with a wrapping key held in memory. */
function fakeKms(version = "3") {
  const wrappingKey = randomBytes(32);
  const requests: { url: string; body: Record<string, string> }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    requests.push({ url, body });
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer test-token",
    );
    if (url.endsWith(":encrypt")) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", wrappingKey, iv);
      const sealed = Buffer.concat([
        iv,
        cipher.update(Buffer.from(body.plaintext!, "base64")),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      return Response.json({
        name: `${keyId}/cryptoKeyVersions/${version}`,
        ciphertext: sealed.toString("base64"),
      });
    }
    if (url.endsWith(":decrypt")) {
      const sealed = Buffer.from(body.ciphertext!, "base64");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        wrappingKey,
        sealed.subarray(0, 12),
      );
      decipher.setAuthTag(sealed.subarray(-16));
      try {
        const plaintext = Buffer.concat([
          decipher.update(sealed.subarray(12, -16)),
          decipher.final(),
        ]);
        return Response.json({ plaintext: plaintext.toString("base64") });
      } catch {
        return new Response("{}", { status: 400 });
      }
    }
    return new Response("{}", { status: 404 });
  });
  const provider = new GcpKmsDataKeyProvider({
    fetch: fetchMock as unknown as typeof fetch,
    accessToken: async () => "test-token",
  });
  return { provider, requests };
}

describe("Google Cloud KMS data keys", () => {
  it("wraps a fresh local data key and records the crypto key version", async () => {
    const { provider, requests } = fakeKms("3");
    const first = await provider.generateDataKey(keyId);
    const second = await provider.generateDataKey(keyId);
    expect(first.plaintextKey).toHaveLength(32);
    expect(Buffer.from(first.plaintextKey)).not.toEqual(
      Buffer.from(second.plaintextKey),
    );
    expect(first.keyVersion).toBe("3");
    expect(requests[0]!.url).toBe(
      `https://cloudkms.googleapis.com/v1/${keyId}:encrypt`,
    );
    await expect(
      provider.decryptDataKey({
        keyId,
        encryptedKey: first.encryptedKey,
        keyVersion: first.keyVersion,
      }),
    ).resolves.toEqual(Buffer.from(first.plaintextKey));
  });

  it("rejects malformed key names and surfaces only a status on failure", async () => {
    const { provider } = fakeKms();
    await expect(provider.generateDataKey("not/a/key")).rejects.toThrow(
      "KMS_KEY_ID_INVALID",
    );
    await expect(
      provider.decryptDataKey({
        keyId,
        encryptedKey: randomBytes(60).toString("base64"),
        keyVersion: "1",
      }),
    ).rejects.toThrow("KMS_REQUEST_FAILED_400");
  });
});

describe("customer-private cipher", () => {
  const subject = {
    merchantId: "00000000-0000-7000-8000-000000005001",
    customerId: "00000000-0000-7000-8000-000000005002",
  };

  it("round trips a phone bound to its merchant, customer, and field", async () => {
    const { provider } = fakeKms();
    const cipher = new CustomerPrivateCipher(
      new EnvelopeEncryptionService(provider, keyId),
    );
    const { ciphertext, keyVersion } = await cipher.encrypt(
      subject,
      "phone_e164",
      "+12025550142",
    );
    expect(ciphertext.startsWith("env1:")).toBe(true);
    expect(ciphertext).not.toContain("2025550142");
    expect(keyVersion).toBe("3");
    await expect(
      cipher.decrypt(subject, "phone_e164", ciphertext),
    ).resolves.toBe("+12025550142");

    for (const [otherSubject, field] of [
      [{ ...subject, merchantId: subject.customerId }, "phone_e164"],
      [subject, "given_name"],
    ] as const)
      await expect(
        cipher.decrypt(otherSubject, field, ciphertext),
      ).rejects.toThrow();
  });

  it("refuses synthetic and malformed ciphertext", async () => {
    const { provider } = fakeKms();
    const cipher = new CustomerPrivateCipher(
      new EnvelopeEncryptionService(provider, keyId),
    );
    for (const value of ["synthetic:v1:+12025550123", "env1:not-json"])
      await expect(
        cipher.decrypt(subject, "phone_e164", value),
      ).rejects.toThrow("CUSTOMER_PRIVATE_CIPHERTEXT_INVALID");
  });
});
