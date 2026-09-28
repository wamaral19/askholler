import {
  getTwilioServerDependencies,
  verifyTwilioRequest,
} from "../lib/twilio-server.server";

export async function action({ request }: { request: Request }) {
  const deps = getTwilioServerDependencies();
  const form = new URLSearchParams(await request.text());
  if (!(await verifyTwilioRequest(request, form, deps)))
    return new Response("Forbidden", { status: 403 });
  // Dial leg callbacks may include a child CallSid. Prefer ParentCallSid so
  // status always updates the browser call that was bound by the voice hook.
  const callSid = form.get("ParentCallSid") ?? form.get("CallSid") ?? "";
  const status = form.get("CallStatus") ?? "";
  if (!/^CA[a-fA-F0-9]{32}$/.test(callSid) || !status)
    return new Response("Bad Request", { status: 400 });
  await deps.store.updateCall(callSid, status);
  return new Response(null, { status: 204 });
}
