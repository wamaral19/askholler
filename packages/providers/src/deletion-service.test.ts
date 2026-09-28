import { describe, expect, it } from "vitest";
import {
  DeletionService,
  type DeletionRepository,
  type DeletionRequestRecord,
} from "./deletion-service";
function repository(request: DeletionRequestRecord) {
  const completed = new Set<string>();
  const repo: DeletionRepository = {
    getRequest: async (merchantId) =>
      merchantId === request.merchantId ? request : undefined,
    begin: async () => undefined,
    isStepComplete: async (_m, _r, key) => completed.has(key),
    completeStep: async (_m, _r, key) => void completed.add(key),
    failStep: async () => undefined,
    complete: async () => undefined,
  };
  return { repo, completed };
}
describe("deletion service", () => {
  it("runs idempotent steps and skips completed work on retry", async () => {
    const state = repository({
      id: "request",
      merchantId: "merchant-a",
      scope: "customer",
      subjectRefHash: "sha256:opaque",
      status: "pending",
      legalHold: false,
    });
    let calls = 0;
    const service = new DeletionService(state.repo, () => new Date(0));
    await expect(
      service.execute("merchant-a", "request", [
        { key: "pii", delete: async () => void calls++ },
      ]),
    ).resolves.toBe("completed");
    await service.execute("merchant-a", "request", [
      { key: "pii", delete: async () => void calls++ },
    ]);
    expect(calls).toBe(1);
  });
  it("fails closed on tenant mismatch and does no work under legal hold", async () => {
    const state = repository({
      id: "request",
      merchantId: "merchant-a",
      scope: "customer",
      subjectRefHash: "sha256:opaque",
      status: "pending",
      legalHold: true,
    });
    const service = new DeletionService(state.repo, () => new Date(0));
    let calls = 0;
    await expect(service.execute("merchant-b", "request", [])).rejects.toThrow(
      "DELETION_REQUEST_NOT_FOUND",
    );
    await expect(
      service.execute("merchant-a", "request", [
        { key: "pii", delete: async () => void calls++ },
      ]),
    ).resolves.toBe("blocked_legal_hold");
    expect(calls).toBe(0);
  });
});
