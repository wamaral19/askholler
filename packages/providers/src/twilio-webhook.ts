export interface TwilioWebhookVerificationInput {
  readonly authToken: string;
  /** Exact externally visible URL, including query string. */
  readonly url: string;
  readonly signature: string | null;
  /** Parsed application/x-www-form-urlencoded fields. */
  readonly parameters:
    URLSearchParams | Readonly<Record<string, string | readonly string[]>>;
}

/** Verify before parsing or acting on a Twilio webhook. */
export async function verifyTwilioWebhookSignature(
  input: TwilioWebhookVerificationInput,
): Promise<boolean> {
  if (input.signature === null || input.signature.length === 0) return false;
  const payload = input.url + canonicalParameters(input.parameters);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  return constantTimeEqual(encodeBytesBase64(digest), input.signature);
}

function canonicalParameters(
  parameters: TwilioWebhookVerificationInput["parameters"],
): string {
  const values = new Map<string, string[]>();
  if (parameters instanceof URLSearchParams) {
    for (const [key, value] of parameters) {
      const existing = values.get(key) ?? [];
      existing.push(value);
      values.set(key, existing);
    }
  } else {
    for (const [key, value] of Object.entries(parameters)) {
      values.set(key, typeof value === "string" ? [value] : [...value]);
    }
  }
  return [...values.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .flatMap(([key, entries]) =>
      entries.sort().map((value) => `${key}${value}`),
    )
    .join("");
}

function encodeBytesBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
