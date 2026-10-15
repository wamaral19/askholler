/**
 * Hands a call to a Zapier "Catch Hook" so a Zap can place it with the team's
 * phone system. Holler does not learn the call's outcome from Zapier; the
 * researcher records it (completed, no answer, do not contact) in the
 * interview.
 *
 * The payload carries the customer's phone number, so it leaves Holler only
 * after the claim-gated, audited reveal, and is never logged.
 */
export interface ZapierDialRequest {
  readonly interviewId: string;
  readonly researcherId: string;
  /** E.164 number the Zap dials. */
  readonly phone: string;
  /** Shopify order name (e.g. "#1042"); non-PII reference. */
  readonly orderNumber: string | null;
  readonly merchant: string;
  readonly moment: string;
}

export class ZapierDialError extends Error {
  constructor(readonly code: "ZAPIER_NOT_CONFIGURED" | "ZAPIER_REJECTED") {
    super(code);
  }
}

export function zapierDialerEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.DIALER_PROVIDER === "zapier";
}

export async function sendZapierDialRequest(
  request: ZapierDialRequest,
  {
    env = process.env,
    fetchImpl = fetch,
    now = () => new Date(),
  }: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now?: () => Date;
  } = {},
): Promise<void> {
  const url = env.ZAPIER_DIAL_WEBHOOK_URL;
  if (!url) throw new ZapierDialError("ZAPIER_NOT_CONFIGURED");
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "holler.call_requested",
      requestedAt: now().toISOString(),
      ...request,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
  if (!response?.ok) throw new ZapierDialError("ZAPIER_REJECTED");
}
