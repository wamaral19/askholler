import {
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import {
  createCallIntent,
  getTwilioServerDependencies,
} from "../lib/twilio-server.server";

export async function loader({ request }: { request: Request }) {
  const context = getTenantContext(request);
  const interviewId = new URL(request.url).searchParams.get("interviewId");
  if (!interviewId)
    return Response.json(
      { error: { code: "INTERVIEW_ID_REQUIRED" } },
      { status: 400 },
    );
  const workspace = await getOperationsService().getInterview(
    context,
    interviewId,
  );
  const deps = getTwilioServerDependencies();
  const intent = await createCallIntent(deps, {
    merchantId: context.merchantId,
    interviewId: workspace.id,
    assignmentId: workspace.assignment.id,
    researcherId: context.researcherId,
  });
  const token = await deps.createVoiceToken(
    `researcher-${context.researcherId}`,
  );
  return Response.json(
    { token, params: { intent } },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}
