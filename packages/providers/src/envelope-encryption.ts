import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface DataKeyProvider {
  generateDataKey(
    keyId: string,
  ): Promise<{
    plaintextKey: Uint8Array;
    encryptedKey: string;
    keyVersion: string;
  }>;
  decryptDataKey(input: {
    keyId: string;
    encryptedKey: string;
    keyVersion: string;
  }): Promise<Uint8Array>;
}
export interface EncryptedEnvelope {
  readonly algorithm: "AES-256-GCM";
  readonly keyId: string;
  readonly keyVersion: string;
  readonly encryptedDataKey: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly authTag: string;
}

export class EnvelopeEncryptionService {
  constructor(
    private readonly keys: DataKeyProvider,
    private readonly keyId: string,
  ) {
    if (!keyId || /example|replace|changeme/i.test(keyId))
      throw new Error("KMS_KEY_ID_INVALID");
  }
  async encrypt(
    plaintext: string,
    context: Readonly<Record<string, string>>,
  ): Promise<EncryptedEnvelope> {
    const key = await this.keys.generateDataKey(this.keyId);
    if (key.plaintextKey.byteLength !== 32)
      throw new Error("KMS_DATA_KEY_INVALID");
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv("aes-256-gcm", key.plaintextKey, iv);
      cipher.setAAD(Buffer.from(stableContext(context)));
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      return {
        algorithm: "AES-256-GCM",
        keyId: this.keyId,
        keyVersion: key.keyVersion,
        encryptedDataKey: key.encryptedKey,
        iv: iv.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
      };
    } finally {
      Buffer.from(key.plaintextKey).fill(0);
    }
  }
  async decrypt(
    envelope: EncryptedEnvelope,
    context: Readonly<Record<string, string>>,
  ): Promise<string> {
    if (envelope.algorithm !== "AES-256-GCM" || envelope.keyId !== this.keyId)
      throw new Error("ENCRYPTED_ENVELOPE_INVALID");
    const key = await this.keys.decryptDataKey({
      keyId: envelope.keyId,
      encryptedKey: envelope.encryptedDataKey,
      keyVersion: envelope.keyVersion,
    });
    if (key.byteLength !== 32) throw new Error("KMS_DATA_KEY_INVALID");
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(envelope.iv, "base64"),
      );
      decipher.setAAD(Buffer.from(stableContext(context)));
      decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } finally {
      Buffer.from(key).fill(0);
    }
  }
}
function stableContext(context: Readonly<Record<string, string>>): string {
  return Object.keys(context)
    .sort()
    .map((key) => `${key}=${context[key]}`)
    .join("\n");
}
