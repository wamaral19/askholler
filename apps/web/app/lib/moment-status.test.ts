import { describe, expect, it } from "vitest";

import {
  canManageMoments,
  canTransitionMoment,
  momentStatusFromPersisted,
  momentTransitionLabel,
  persistedMomentStatus,
} from "./moment-status";

describe("moment status", () => {
  it("lets live moments pause or complete and completed moments reopen", () => {
    expect(canTransitionMoment("live", "paused")).toBe(true);
    expect(canTransitionMoment("live", "completed")).toBe(true);
    expect(canTransitionMoment("paused", "live")).toBe(true);
    expect(canTransitionMoment("paused", "completed")).toBe(true);
    expect(canTransitionMoment("completed", "live")).toBe(true);
    expect(canTransitionMoment("completed", "paused")).toBe(false);
    expect(canTransitionMoment("live", "live")).toBe(false);
    expect(canTransitionMoment("draft", "live")).toBe(false);
    expect(momentTransitionLabel("completed", "live")).toBe("Reopen");
    expect(momentTransitionLabel("paused", "live")).toBe("Resume");
  });

  it("round-trips through the persisted status the worker qualifies on", () => {
    expect(persistedMomentStatus.live).toBe("active");
    for (const status of ["live", "paused", "completed"] as const)
      expect(
        momentStatusFromPersisted(persistedMomentStatus[status], true),
      ).toBe(status);
    expect(momentStatusFromPersisted("active", false)).toBe("draft");
  });

  it("reserves status changes for managers and admins", () => {
    expect(canManageMoments(["researcher"])).toBe(false);
    expect(canManageMoments(["research_manager"])).toBe(true);
    expect(canManageMoments(["merchant_admin"])).toBe(true);
  });
});
