import {
  CustomerPrivateCipher,
  EnvelopeEncryptionService,
  createGcpKmsDataKeyProvider,
} from "@holler/providers";

let cipher: CustomerPrivateCipher | undefined;

/**
 * The customer-private cipher when PII_KMS_KEY_ID names a Cloud KMS key, or
 * undefined in development without KMS (contact details are then dropped at
 * ingestion). Production refuses to run without it.
 */
export function getCustomerPrivateCipher(): CustomerPrivateCipher | undefined {
  if (cipher) return cipher;
  const keyId = process.env.PII_KMS_KEY_ID;
  if (!keyId) {
    if (process.env.NODE_ENV === "production")
      throw new Error("PII_KMS_KEY_ID is required in production");
    return undefined;
  }
  cipher = new CustomerPrivateCipher(
    new EnvelopeEncryptionService(createGcpKmsDataKeyProvider(), keyId),
  );
  return cipher;
}
