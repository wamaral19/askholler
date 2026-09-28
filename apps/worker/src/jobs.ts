import { z } from "zod";

const opaqueId = z.string().uuid();

export const jobSchemas = {
  normalize_webhook: z
    .object({ merchantId: opaqueId, receiptId: opaqueId })
    .strict(),
  evaluate_commerce_event: z
    .object({ merchantId: opaqueId, commerceEventId: opaqueId })
    .strict(),
  expire_assignments: z
    .object({ merchantId: opaqueId, assignmentId: opaqueId })
    .strict(),
  render_report: z
    .object({ merchantId: opaqueId, reportRevisionId: opaqueId })
    .strict(),
} as const;

export type JobName = keyof typeof jobSchemas;
export type NormalizeWebhookPayload = z.infer<
  (typeof jobSchemas)["normalize_webhook"]
>;
export type EvaluateCommerceEventPayload = z.infer<
  (typeof jobSchemas)["evaluate_commerce_event"]
>;
export type ExpireAssignmentsPayload = z.infer<
  (typeof jobSchemas)["expire_assignments"]
>;
export type RenderReportPayload = z.infer<(typeof jobSchemas)["render_report"]>;

export const jobPolicies = {
  normalize_webhook: {
    maxAttempts: 10,
    idempotencyKey: (payload: NormalizeWebhookPayload) =>
      `normalize_webhook:${payload.receiptId}`,
  },
  evaluate_commerce_event: {
    maxAttempts: 10,
    idempotencyKey: (payload: EvaluateCommerceEventPayload) =>
      `evaluate_commerce_event:${payload.commerceEventId}`,
  },
  expire_assignments: {
    maxAttempts: 5,
    idempotencyKey: (payload: ExpireAssignmentsPayload) =>
      `expire_assignments:${payload.assignmentId}`,
  },
  render_report: {
    maxAttempts: 5,
    idempotencyKey: (payload: RenderReportPayload) =>
      `render_report:${payload.reportRevisionId}`,
  },
} as const;

export class SafeJobError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "SafeJobError";
  }
}

export function classifyJobError(error: unknown): SafeJobError {
  if (error instanceof SafeJobError) return error;
  if (error instanceof z.ZodError)
    return new SafeJobError("JOB_PAYLOAD_INVALID", false);
  return new SafeJobError("JOB_OPERATION_FAILED", true);
}

export interface WorkerServices {
  normalizeWebhook(payload: NormalizeWebhookPayload): Promise<void>;
  evaluateCommerceEvent(payload: EvaluateCommerceEventPayload): Promise<void>;
  expireAssignment(payload: ExpireAssignmentsPayload): Promise<void>;
  renderReport(payload: RenderReportPayload): Promise<void>;
}

export function unavailableWorkerServices(): WorkerServices {
  const unavailable = async (): Promise<never> => {
    throw new SafeJobError("JOB_SERVICE_UNAVAILABLE", true);
  };
  return {
    normalizeWebhook: unavailable,
    evaluateCommerceEvent: unavailable,
    expireAssignment: unavailable,
    renderReport: unavailable,
  };
}
