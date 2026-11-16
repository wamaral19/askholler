/**
 * Posts short operational alerts (new installs, new research requests) to a
 * chat incoming webhook so staff can act while a merchant, or an App Store
 * reviewer, is still in the app.
 *
 * OPS_ALERT_WEBHOOK_URL takes a Google Chat or Slack incoming-webhook URL;
 * both accept `{ "text": "..." }`. Unset, alerts are skipped.
 *
 * Alerts carry shop domains and request names only, never customer data.
 * Sending never throws: an alert failure must not break an install or a
 * request.
 */
export async function sendOpsAlert(
  text: string,
  {
    env = process.env,
    fetchImpl = fetch,
  }: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<"sent" | "skipped" | "failed"> {
  const url = env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!url) return "skipped";
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) return "sent";
    console.warn(
      JSON.stringify({ event: "ops_alert.rejected", status: response.status }),
    );
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "ops_alert.failed",
        error: error instanceof Error ? error.name : typeof error,
      }),
    );
  }
  return "failed";
}

/** Absolute staff URL for a path, when APP_BASE_URL is configured. */
export function staffUrl(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const base = env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}${path}` : null;
}
