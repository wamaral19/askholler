import {
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { getTwilioServerDependencies } from "../lib/twilio-server.server";

export async function action({ request }: { request: Request }) {
  const context = getTenantContext(request);
  const body = (await request.json().catch(() => null)) as {
    interviewId?: unknown;
    action?: unknown;
  } | null;
  if (
    !body ||
    typeof body.interviewId !== "string" ||
    (body.action !== "start" && body.action !== "stop")
  )
    return Response.json(
      { error: { code: "INVALID_RECORDING_REQUEST" } },
      { status: 400 },
    );
  await getOperationsService().getInterview(context, body.interviewId);
  const deps = getTwilioServerDependencies();
  if (body.action === "start") {
    // This endpoint is the server-side consent attestation transition; the
    // provider cannot start until the durable interview value is granted.
    const callSid = await deps.store.grantConsentAndGetCall(
      context,
      body.interviewId,
    );
    if (!callSid)
      return Response.json(
        { error: { code: "CALL_NOT_CONNECTED" } },
        { status: 409 },
      );
    const result = await deps.dialer.startRecording({
      providerCallReference: callSid,
      idempotencyKey: `recording:${body.interviewId}`,
      statusCallbackUrl: `${deps.appBaseUrl}/api/twilio/recording-status`,
    });
    await deps.store.saveRecording({
      merchantId: context.merchantId,
      interviewId: body.interviewId,
      callSid,
      recordingSid: result.providerRecordingReference,
      status: result.status,
    });
    return Response.json(
      { status: result.status },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const recording = await deps.store.getRecordingForCall(
    context,
    body.interviewId,
  );
  if (!recording)
    return Response.json(
      { error: { code: "RECORDING_NOT_FOUND" } },
      { status: 404 },
    );
  const result = await deps.dialer.stopRecording(
    recording.callSid,
    recording.recordingSid,
  );
  await deps.store.updateRecording(recording.recordingSid, result.status);
  return Response.json(
    { status: result.status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
