import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EnvelopeEncryptionService,
  type DataKeyProvider,
} from "./envelope-encryption";
class MemoryKms implements DataKeyProvider {
  private readonly key = randomBytes(32);
  async generateDataKey(_keyId: string) {
    return {
      plaintextKey: this.key,
      encryptedKey: "opaque-kms-ciphertext",
      keyVersion: "1",
    };
  }
  async decryptDataKey(input: { encryptedKey: string }) {
    if (input.encryptedKey !== "opaque-kms-ciphertext")
      throw new Error("KMS_DECRYPT_FAILED");
    return this.key;
  }
}
describe("envelope encryption", () => {
  it("round trips only with bound context and rejects tampering", async () => {
    const service = new EnvelopeEncryptionService(
      new MemoryKms(),
      "arn:aws:kms:us-east-1:111122223333:key/test",
    );
    const context = {
      merchantId: "merchant-a",
      customerId: "customer-a",
      field: "phone",
    };
    const envelope = await service.encrypt("+12025550142", context);
    expect(JSON.stringify(envelope)).not.toContain("+12025550142");
    await expect(service.decrypt(envelope, context)).resolves.toBe(
      "+12025550142",
    );
    await expect(
      service.decrypt(envelope, { ...context, merchantId: "merchant-b" }),
    ).rejects.toThrow();
    await expect(
      service.decrypt(
        { ...envelope, authTag: "AAAAAAAAAAAAAAAAAAAAAA==" },
        context,
      ),
    ).rejects.toThrow();
  });
  it("rejects placeholder keys", () =>
    expect(
      () => new EnvelopeEncryptionService(new MemoryKms(), "replace-me"),
    ).toThrow("KMS_KEY_ID_INVALID"));
});
