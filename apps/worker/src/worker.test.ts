import { describe, expect, it, vi } from "vitest";
import { processNextJob, type ClaimedJob, type DurableQueue } from "./worker";

const job: ClaimedJob = {
  id: "job-1",
  merchant_id: "merchant-1",
  job_type: "test",
  payload: {},
  attempts: 1,
};

function queueFor(claimed: ClaimedJob | undefined) {
  return {
    claim: vi.fn().mockResolvedValue(claimed),
    complete: vi.fn().mockResolvedValue({}),
    retry: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
    recoverStaleLocks: vi.fn().mockResolvedValue([]),
  } satisfies DurableQueue;
}

describe("durable worker", () => {
  it("claims, handles, and completes one job", async () => {
    const queue = queueFor(job);
    const handler = vi.fn().mockResolvedValue(undefined);
    await expect(
      processNextJob(queue, { test: handler }, { workerId: "worker-1" }),
    ).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(job);
    expect(queue.complete).toHaveBeenCalledWith(
      "merchant-1",
      "job-1",
      "worker-1",
      expect.any(Date),
    );
  });

  it("backs off retryable failures and permanently fails unsupported jobs", async () => {
    const now = new Date("2026-09-24T12:00:00.000Z");
    const queue = queueFor(job);
    await processNextJob(
      queue,
      {
        test: async () => {
          throw new TypeError("synthetic failure");
        },
      },
      { workerId: "worker-1", now: () => now, retryBaseMs: 100 },
    );
    expect(queue.retry).toHaveBeenCalledWith(
      "merchant-1",
      "job-1",
      "worker-1",
      new Date("2026-09-24T12:00:00.100Z"),
      "TypeError",
    );

    const unsupported = queueFor({ ...job, job_type: "unknown" });
    await processNextJob(
      unsupported,
      {},
      { workerId: "worker-1", now: () => now },
    );
    expect(unsupported.fail).toHaveBeenCalledWith(
      "merchant-1",
      "job-1",
      "worker-1",
      "unsupported_job_type",
      now,
    );
  });

  it("does nothing when the queue is empty", async () => {
    const queue = queueFor(undefined);
    await expect(
      processNextJob(queue, {}, { workerId: "worker-1" }),
    ).resolves.toBe(false);
  });
});
