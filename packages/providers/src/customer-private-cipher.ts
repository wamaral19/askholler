import {
  EnvelopeEncryptionService,
  type EncryptedEnvelope,
} from "./envelope-encryption";

/** Stored-ciphertext prefix; `synthetic:` values are never accepted here. */
const PREFIX = "env1:";

export type CustomerPrivateField = "phone_e164" | "given_name";

export interface CustomerPrivateSubject {
  readonly merchantId: string;
  readonly customerId: string;
}

/**
 * Encrypts customer-private fields into text columns. The merchant, customer,
 * and field are bound as authenticated data, so a ciphertext copied to
 * another row or tenant fails to decrypt.
 */
export class CustomerPrivateCipher {
  constructor(private readonly envelopes: EnvelopeEncryptionService) {}

  async encrypt(
    subject: CustomerPrivateSubject,
    field: CustomerPrivateField,
    value: string,
  ): Promise<{ ciphertext: string; keyVersion: string }> {
    const envelope = await this.envelopes.encrypt(
      value,
      context(subject, field),
    );
    return {
      ciphertext: `${PREFIX}${Buffer.from(JSON.stringify(envelope)).toString("base64url")}`,
      keyVersion: envelope.keyVersion,
    };
  }

  async decrypt(
    subject: CustomerPrivateSubject,
    field: CustomerPrivateField,
    ciphertext: string,
  ): Promise<string> {
    if (!ciphertext.startsWith(PREFIX))
      throw new Error("CUSTOMER_PRIVATE_CIPHERTEXT_INVALID");
    let envelope: EncryptedEnvelope;
    try {
      envelope = JSON.parse(
        Buffer.from(ciphertext.slice(PREFIX.length), "base64url").toString(
          "utf8",
        ),
      ) as EncryptedEnvelope;
    } catch {
      throw new Error("CUSTOMER_PRIVATE_CIPHERTEXT_INVALID");
    }
    return this.envelopes.decrypt(envelope, context(subject, field));
  }
}

export function isEnvelopeCiphertext(value: string | null): boolean {
  return value?.startsWith(PREFIX) ?? false;
}

function context(
  subject: CustomerPrivateSubject,
  field: CustomerPrivateField,
): Record<string, string> {
  return {
    merchantId: subject.merchantId,
    customerId: subject.customerId,
    field,
  };
}
