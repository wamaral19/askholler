export interface TwilioVoiceTokenConfig {
  readonly accountSid: string;
  readonly apiKeySid: string;
  readonly apiKeySecret: string;
  readonly outgoingApplicationSid: string;
  readonly ttlSeconds?: number;
  readonly now?: () => number;
  readonly randomId?: () => string;
}

export interface CreateTwilioVoiceTokenInput {
  /** Opaque researcher identifier. It must not contain email or customer data. */
  readonly identity: string;
  readonly incomingAllow?: boolean;
}

/** Creates the short-lived token returned by GET /api/twilio/token. */
export async function createTwilioVoiceToken(
  config: TwilioVoiceTokenConfig,
  input: CreateTwilioVoiceTokenInput,
): Promise<string> {
  assertTwilioSid(config.accountSid, "AC", "accountSid");
  assertTwilioSid(config.apiKeySid, "SK", "apiKeySid");
  assertTwilioSid(
    config.outgoingApplicationSid,
    "AP",
    "outgoingApplicationSid",
  );
  if (!/^[A-Za-z0-9_.-]{1,121}$/.test(input.identity)) {
    throw new Error("identity must be an opaque 1-121 character identifier");
  }
  const ttl = config.ttlSeconds ?? 300;
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 3600) {
    throw new Error("ttlSeconds must be between 60 and 3600");
  }
  const issuedAt = Math.floor((config.now?.() ?? Date.now()) / 1000);
  const grants: Record<string, unknown> = {
    identity: input.identity,
    voice: { outgoing: { application_sid: config.outgoingApplicationSid } },
  };
  if (input.incomingAllow === true) {
    grants.voice = {
      ...(grants.voice as object),
      incoming: { allow: true },
    };
  }
  const header = { alg: "HS256", cty: "twilio-fpa;v=1", typ: "JWT" };
  const payload = {
    jti: `${config.apiKeySid}-${config.randomId?.() ?? crypto.randomUUID()}`,
    grants,
    iat: issuedAt,
    exp: issuedAt + ttl,
    iss: config.apiKeySid,
    sub: config.accountSid,
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.apiKeySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned)),
  );
  return `${unsigned}.${base64UrlBytes(signature)}`;
}

function base64UrlJson(value: unknown): string {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function assertTwilioSid(value: string, prefix: string, field: string): void {
  if (!new RegExp(`^${prefix}[a-fA-F0-9]{32}$`).test(value)) {
    throw new Error(`${field} is invalid`);
  }
}
