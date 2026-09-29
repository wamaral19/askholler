import type { WorkforceRole } from "@holler/domain";

import type { MomentRunStatus } from "./operations-types";
import type { MomentStatus } from "./prototype-data";

/**
 * Live is the only status that qualifies new orders into the queue. Completed
 * moments can be reopened, so completed behaves like paused.
 */
const transitions: Readonly<Record<MomentStatus, readonly MomentRunStatus[]>> =
  {
    draft: [],
    live: ["paused", "completed"],
    paused: ["live", "completed"],
    completed: ["live"],
  };

export function momentTransitionsFrom(
  status: MomentStatus,
): readonly MomentRunStatus[] {
  return transitions[status];
}

export function canTransitionMoment(
  from: MomentStatus,
  to: MomentRunStatus,
): boolean {
  return transitions[from].includes(to);
}

export function isMomentRunStatus(value: unknown): value is MomentRunStatus {
  return value === "live" || value === "paused" || value === "completed";
}

export function canManageMoments(roles: readonly WorkforceRole[]): boolean {
  return (
    roles.includes("research_manager") ||
    roles.includes("merchant_admin") ||
    roles.includes("platform_admin")
  );
}

export const momentStatusLabels: Readonly<Record<MomentStatus, string>> = {
  live: "Live",
  draft: "Draft",
  paused: "Paused",
  completed: "Completed",
};

/** Verb for the button that moves a moment into `to` from `from`. */
export function momentTransitionLabel(
  from: MomentStatus,
  to: MomentRunStatus,
): string {
  if (to === "paused") return "Pause";
  if (to === "completed") return "Complete";
  return from === "completed" ? "Reopen" : "Resume";
}

/** research_moments.status keeps "active" for live; the worker qualifies on it. */
export const persistedMomentStatus: Readonly<Record<MomentRunStatus, string>> =
  {
    live: "active",
    paused: "paused",
    completed: "completed",
  };

export function momentStatusFromPersisted(
  status: string,
  published: boolean,
): MomentStatus {
  if (!published) return "draft";
  if (status === "active") return "live";
  if (status === "completed") return "completed";
  return "paused";
}
