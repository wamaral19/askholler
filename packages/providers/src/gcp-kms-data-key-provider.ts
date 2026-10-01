import { randomBytes } from "node:crypto";

import { GoogleAuth } from "google-auth-library";

import type { DataKeyProvider } from "./envelope-encryption";

const KMS_API = "https://cloudkms.googleapis.com/v1";
const KEY_NAME =
  /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/;

export interface GcpKmsDependencies {
  readonly fetch: typeof fetch;
  /** Returns an OAuth access token with the cloudkms scope. */
  readonly accessToken: () => Promise<string>;
}

/**
 * Google Cloud KMS has no GenerateDataKey call, so a fresh 256-bit data key
 * is generated locally and wrapped with the symmetric crypto key. The wrapped
 * key names its crypto key version, so rotation needs no re-encryption:
 * decrypt always resolves the version from the ciphertext.
 */
export class GcpKmsDataKeyProvider implements DataKeyProvider {
  constructor(private readonly dependencies: GcpKmsDependencies) {}

  async generateDataKey(keyId: string) {
    assertKeyName(keyId);
    const plaintextKey = randomBytes(32);
    const response = await this.call(`${keyId}:encrypt`, {
      plaintext: plaintextKey.toString("base64"),
    });
    const { ciphertext, name } = response as {
      ciphertext?: unknown;
      name?: unknown;
    };
    if (
      typeof ciphertext !== "string" ||
      typeof name !== "string" ||
      !name.startsWith(`${keyId}/cryptoKeyVersions/`)
    ) {
      plaintextKey.fill(0);
      throw new Error("KMS_ENCRYPT_FAILED");
    }
    return {
      plaintextKey,
      encryptedKey: ciphertext,
      keyVersion: name.slice(name.lastIndexOf("/") + 1),
    };
  }

  async decryptDataKey(input: {
    keyId: string;
    encryptedKey: string;
    keyVersion: string;
  }) {
    assertKeyName(input.keyId);
    const { plaintext } = (await this.call(`${input.keyId}:decrypt`, {
      ciphertext: input.encryptedKey,
    })) as { plaintext?: unknown };
    if (typeof plaintext !== "string") throw new Error("KMS_DECRYPT_FAILED");
    return Buffer.from(plaintext, "base64");
  }

  private async call(path: string, body: object): Promise<unknown> {
    const response = await this.dependencies.fetch(`${KMS_API}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.dependencies.accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    // Only the status is surfaced; KMS error bodies never reach logs.
    if (!response.ok) throw new Error(`KMS_REQUEST_FAILED_${response.status}`);
    return response.json();
  }
}

function assertKeyName(keyId: string): void {
  if (!KEY_NAME.test(keyId)) throw new Error("KMS_KEY_ID_INVALID");
}

/**
 * Uses Application Default Credentials: GOOGLE_APPLICATION_CREDENTIALS names
 * a service-account JSON file (a Render secret file in production) whose
 * identity holds only roles/cloudkms.cryptoKeyEncrypterDecrypter on the key.
 */
export function createGcpKmsDataKeyProvider(): GcpKmsDataKeyProvider {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloudkms"],
  });
  return new GcpKmsDataKeyProvider({
    fetch,
    async accessToken() {
      const token = await auth.getAccessToken();
      if (!token) throw new Error("KMS_CREDENTIALS_UNAVAILABLE");
      return token;
    },
  });
}
