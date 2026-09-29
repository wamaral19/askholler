import { getOperationsService } from "../lib/operations-service.server";
import {
  getTwilioServerDependencies,
  twimlDial,
  verifyCallIntent,
  verifyTwilioRequest,
} from "../lib/twilio-server.server";

export async function action({ request }: { request: Request }) {
  const deps = getTwilioServerDependencies();
  const form = new URLSearchParams(await request.text());
  if (!(await verifyTwilioRequest(request, form, deps)))
    return new Response("Forbidden", { status: 403 });
  const callSid = form.get("CallSid") ?? "";
  const intent = await verifyCallIntent(deps, form.get("intent") ?? "");
  if (
    !intent ||
    !/^CA[a-fA-F0-9]{32}$/.test(callSid) ||
    !(await deps.store.bindIntent(intent, callSid))
  )
    return new Response("Forbidden", { status: 403 });
  const phone = await getOperationsService().revealPhone(
    {
      merchantId: intent.merchantId,
      merchantIds: [intent.merchantId],
      researcherId: intent.researcherId,
      roles: ["researcher"],
      correlationId: intent.nonce,
    },
    intent.assignmentId,
  );
  return new Response(
    twimlDial(
      phone.phone,
      deps.callerId,
      `${deps.appBaseUrl}/api/twilio/call-status`,
    ),
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
