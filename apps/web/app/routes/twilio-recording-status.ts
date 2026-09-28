import {
  getTwilioServerDependencies,
  verifyTwilioRequest,
} from "../lib/twilio-server.server";

export async function action({ request }: { request: Request }) {
  const deps = getTwilioServerDependencies();
  const form = new URLSearchParams(await request.text());
  if (!(await verifyTwilioRequest(request, form, deps)))
    return new Response("Forbidden", { status: 403 });
  const recordingSid = form.get("RecordingSid") ?? "";
  const status = form.get("RecordingStatus") ?? "";
  if (!/^RE[a-fA-F0-9]{32}$/.test(recordingSid) || !status)
    return new Response("Bad Request", { status: 400 });
  await deps.store.updateRecording(recordingSid, status);
  if (status === "completed")
    await deps.transferCompletedRecording?.(recordingSid);
  return new Response(null, { status: 204 });
}
