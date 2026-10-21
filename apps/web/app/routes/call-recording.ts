import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { optionalR2ObjectStore } from "../lib/twilio-server.server";

/** Long enough to listen through a call; the link is never stored. */
const PLAYBACK_LINK_SECONDS = 600;

/**
 * Sends the reviewer's audio player to a short-lived private R2 link. Access
 * is checked (and audited) per request, so the page never embeds the link.
 */
export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { interviewId?: string };
}) {
  return executeOperationsRequest(async () => {
    if (!params.interviewId)
      throw new Response("Interview is required", { status: 400 });
    const key = await getOperationsService().getRecordingObjectKey(
      await getTenantContext(request),
      params.interviewId,
    );
    const store = optionalR2ObjectStore(process.env);
    if (!key || !store)
      throw new Response("Recording unavailable", { status: 404 });
    return new Response(null, {
      status: 302,
      headers: {
        Location: await store.createDownloadUrl(key, PLAYBACK_LINK_SECONDS),
        "Cache-Control": "no-store, private",
        "Referrer-Policy": "no-referrer",
      },
    });
  });
}
