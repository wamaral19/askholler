import { describe, expect, it, vi } from "vitest";
import { SafeJobError, classifyJobError, jobPolicies } from "./jobs";
import { createTaskList } from "./tasks";

const ids = {
  merchantId: "11111111-1111-4111-8111-111111111111",
  receiptId: "22222222-2222-4222-8222-222222222222",
};

function helpers() {
  return {
    logger: { error: vi.fn() },
  } as never;
}

describe("worker job contracts", () => {
  it("rejects malformed and additional payload fields terminally", async () => {
    const service = vi.fn();
    const tasks = createTaskList({
      normalizeWebhook: service,
      evaluateCommerceEvent: vi.fn(),
      expireAssignment: vi.fn(),
      renderReport: vi.fn(),
    });
    await expect(
      tasks.normalize_webhook?.({ ...ids, email: "not-allowed" }, helpers()),
    ).resolves.toBeUndefined();
    expect(service).not.toHaveBeenCalled();
  });

  it("classifies known errors and sanitizes unknown failures", () => {
    expect(
      classifyJobError(new SafeJobError("SAFE_CODE", false)),
    ).toMatchObject({ code: "SAFE_CODE", retryable: false });
    expect(classifyJobError(new Error("secret input"))).toMatchObject({
      code: "JOB_OPERATION_FAILED",
      retryable: true,
    });
  });

  it("is replay-safe by passing the same opaque identity to the service", async () => {
    const service = vi.fn().mockResolvedValue(undefined);
    const tasks = createTaskList({
      normalizeWebhook: service,
      evaluateCommerceEvent: vi.fn(),
      expireAssignment: vi.fn(),
      renderReport: vi.fn(),
    });
    await tasks.normalize_webhook?.(ids, helpers());
    await tasks.normalize_webhook?.(ids, helpers());
    expect(service).toHaveBeenNthCalledWith(1, ids);
    expect(service).toHaveBeenNthCalledWith(2, ids);
    expect(jobPolicies.normalize_webhook.idempotencyKey(ids)).toBe(
      `normalize_webhook:${ids.receiptId}`,
    );
  });

  it("rethrows only a safe code for retryable failures", async () => {
    const tasks = createTaskList({
      normalizeWebhook: vi.fn().mockRejectedValue(new Error("private value")),
      evaluateCommerceEvent: vi.fn(),
      expireAssignment: vi.fn(),
      renderReport: vi.fn(),
    });
    await expect(tasks.normalize_webhook?.(ids, helpers())).rejects.toThrow(
      "JOB_OPERATION_FAILED",
    );
  });
});
