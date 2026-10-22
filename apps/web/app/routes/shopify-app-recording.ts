import type { LoaderFunctionArgs } from "react-router";

import { authenticateMerchant } from "../lib/merchant-context.server";
import {
  executeOperationsRequest,
  getOperationsService,
} from "../lib/operations-service.server";
import { optionalR2ObjectStore } from "../lib/twilio-server.server";

/** Long enough to listen through a call; the link is never stored. */
const PLAYBACK_LINK_SECONDS = 600;

/**
 * Returns a short-lived private R2 link to a call recording for the
 * merchant's player. Access is checked and audited on every request.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { context } = await authenticateMerchant(request);
  return executeOperationsRequest(async () => {
    if (!params.interviewId)
      throw new Response("Interview is required", { status: 400 });
    const key = await getOperationsService().getRecordingObjectKey(
      context,
      params.interviewId,
    );
    const store = optionalR2ObjectStore(process.env);
    if (!key || !store)
      throw Response.json(
        { error: { code: "RECORDING_UNAVAILABLE" } },
        { status: 404 },
      );
    return Response.json(
      { url: await store.createDownloadUrl(key, PLAYBACK_LINK_SECONDS) },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  });
}
