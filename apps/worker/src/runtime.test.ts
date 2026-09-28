import { loadWorkerEnvironment } from "@holler/domain";
import { describe, expect, it, vi } from "vitest";
import { startWorkerRuntime } from "./runtime";

describe("worker runtime", () => {
  it("starts Graphile Worker with an explicit task list", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const startGraphile = vi.fn().mockResolvedValue({
      stop,
      promise: Promise.resolve(),
    });
    const close = vi.fn().mockResolvedValue(undefined);
    const runtime = await startWorkerRuntime(
      loadWorkerEnvironment({
        DATABASE_URL: "postgresql://holler:holler@localhost:5432/holler",
        OUTBOX_POLL_INTERVAL_MS: "60000",
      }),
      { normalize_webhook: vi.fn() },
      {
        startGraphile,
        createDispatcher: () => ({
          drainBatch: vi.fn().mockResolvedValue(0),
          close,
        }),
      },
    );
    expect(startGraphile).toHaveBeenCalledWith(
      expect.objectContaining({
        taskList: { normalize_webhook: expect.any(Function) },
        noHandleSignals: true,
      }),
    );
    await runtime.stop("test");
    expect(stop).toHaveBeenCalledWith("test");
    expect(close).toHaveBeenCalled();
  });
});
