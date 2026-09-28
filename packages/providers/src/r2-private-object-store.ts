import { createHash, createHmac } from "node:crypto";
import type { PrivateObjectStore } from "@holler/domain";

export interface R2PrivateObjectStoreConfig {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly endpoint?: string;
}

export interface R2PrivateObjectStoreOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

/** Private Cloudflare R2 storage using its S3-compatible, AWS SigV4 API. */
export class R2PrivateObjectStore implements PrivateObjectStore {
  private readonly endpoint: URL;
  private readonly fetch: typeof fetch;
  private readonly now: () => Date;

  constructor(
    private readonly config: R2PrivateObjectStoreConfig,
    options: R2PrivateObjectStoreOptions = {},
  ) {
    for (const [name, value] of Object.entries(config)) {
      if (!value) throw new Error(`R2_CONFIG_MISSING:${name}`);
    }
    this.endpoint = new URL(
      config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
    );
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
  }

  async put(input: {
    key: string;
    mediaType: string;
    bytes: Uint8Array;
  }): Promise<{ checksum: string }> {
    const key = normalizeKey(input.key);
    if (!input.mediaType) throw new Error("OBJECT_MEDIA_TYPE_REQUIRED");
    const payloadHash = sha256Hex(input.bytes);
    const checksumBase64 = createHash("sha256")
      .update(input.bytes)
      .digest("base64");
    const response = await this.signedRequest("PUT", key, input.bytes, {
      "content-type": input.mediaType,
      "x-amz-checksum-sha256": checksumBase64,
    });
    if (!response.ok) await throwR2Error("PUT", response);
    return { checksum: `sha256:${payloadHash}` };
  }

  async delete(key: string): Promise<void> {
    const response = await this.signedRequest(
      "DELETE",
      normalizeKey(key),
      undefined,
    );
    if (!response.ok && response.status !== 404)
      await throwR2Error("DELETE", response);
  }

  async createDownloadUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds < 1 ||
      expiresInSeconds > 604_800
    ) {
      throw new Error("R2_DOWNLOAD_EXPIRY_INVALID");
    }
    const date = this.now();
    const amzDate = formatAmzDate(date);
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const url = this.objectUrl(normalizeKey(key));
    const query = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.config.accessKeyId}/${scope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresInSeconds),
      "X-Amz-SignedHeaders": "host",
    });
    const canonicalQuery = canonicalSearch(query);
    const canonicalRequest = [
      "GET",
      url.pathname,
      canonicalQuery,
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    query.set(
      "X-Amz-Signature",
      hmacHex(signingKey(this.config.secretAccessKey, dateStamp), stringToSign),
    );
    url.search = canonicalSearch(query);
    return url.toString();
  }

  private async signedRequest(
    method: string,
    key: string,
    body: Uint8Array | undefined,
    extraHeaders: Readonly<Record<string, string>> = {},
  ): Promise<Response> {
    const date = this.now();
    const amzDate = formatAmzDate(date);
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const url = this.objectUrl(key);
    const payloadHash = sha256Hex(body ?? new Uint8Array());
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...extraHeaders,
    };
    const headerNames = Object.keys(headers).sort();
    const canonicalHeaders = headerNames
      .map((name) => `${name}:${headers[name]!.trim().replace(/\s+/g, " ")}\n`)
      .join("");
    const canonicalRequest = [
      method,
      url.pathname,
      "",
      canonicalHeaders,
      headerNames.join(";"),
      payloadHash,
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    headers.authorization =
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, ` +
      `SignedHeaders=${headerNames.join(";")}, ` +
      `Signature=${hmacHex(signingKey(this.config.secretAccessKey, dateStamp), stringToSign)}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = Buffer.from(body);
    return this.fetch(url, init);
  }

  private objectUrl(key: string): URL {
    const url = new URL(this.endpoint);
    const basePath = url.pathname.replace(/\/$/, "");
    url.pathname = `${basePath}/${encodeURIComponent(this.config.bucket)}/${encodeKey(key)}`;
    return url;
  }
}

function normalizeKey(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === ".."))
    throw new Error("OBJECT_KEY_INVALID");
  return normalized;
}

function encodeKey(key: string): string {
  return key.split("/").map(awsEncode).join("/");
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Uint8Array, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Uint8Array, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function signingKey(secret: string, dateStamp: string): Buffer {
  return hmac(
    hmac(hmac(hmac(`AWS4${secret}`, dateStamp), "auto"), "s3"),
    "aws4_request",
  );
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalSearch(query: URLSearchParams): string {
  return [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function throwR2Error(
  operation: string,
  response: Response,
): Promise<never> {
  const requestId =
    response.headers.get("cf-ray") ?? response.headers.get("x-amz-request-id");
  throw new Error(
    `R2_${operation}_FAILED:${response.status}${requestId ? `:${requestId}` : ""}`,
  );
}
