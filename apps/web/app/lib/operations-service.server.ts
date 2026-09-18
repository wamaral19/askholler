import {
  pinnedScript,
  queueAssignments,
  researchFields,
  researchMoments,
} from "./prototype-data";
import type {
  InterviewWorkspace,
  OperationsApplicationService,
  QueueItem,
  TenantContext,
} from "./operations-types";

const SYNTHETIC_CONTEXT: TenantContext = {
  merchantId: "merchant-synthetic-northstar",
  researcherId: "researcher-synthetic-001",
};

function createSyntheticService(): OperationsApplicationService {
  const statuses = new Map<string, QueueItem["status"]>();
  const interviews = new Map<string, InterviewWorkspace>();

  const queueItem = (id: string): QueueItem => {
    const item = queueAssignments.find((candidate) => candidate.id === id);
    if (!item) throw new Response("Assignment not found", { status: 404 });
    const { syntheticPhone: _phone, ...safe } = item;
    const status = statuses.get(id) ?? "queued";
    return {
      ...safe,
      status,
      ...(status === "queued"
        ? {}
        : { claimedByResearcherId: SYNTHETIC_CONTEXT.researcherId }),
    };
  };

  const requireClaim = (context: TenantContext, id: string) => {
    const item = queueItem(id);
    if (item.claimedByResearcherId !== context.researcherId) {
      throw new Response("Claim required", { status: 403 });
    }
    return item;
  };

  return {
    async listMoments() {
      return researchMoments;
    },
    async saveMoment(_context, input) {
      return { id: `moment-${input.publish ? "published" : "draft"}` };
    },
    async listQueue() {
      return queueAssignments.map((item) => queueItem(item.id));
    },
    async claimAssignment(context, id) {
      const current = queueItem(id);
      if (
        current.status !== "queued" &&
        current.claimedByResearcherId !== context.researcherId
      ) {
        throw new Response("Assignment already claimed", { status: 409 });
      }
      statuses.set(id, "claimed");
      return queueItem(id);
    },
    async releaseAssignment(context, id) {
      requireClaim(context, id);
      statuses.set(id, "queued");
      return queueItem(id);
    },
    async startInterview(context, id) {
      const assignment = requireClaim(context, id);
      statuses.set(id, "dialing");
      const workspace: InterviewWorkspace = {
        id,
        assignment: { ...assignment, status: "dialing" },
        scriptName: "Repeat purchase",
        scriptVersion: 3,
        fieldSetVersion: 1,
        script: pinnedScript,
        fields: researchFields,
        status: "dialing",
      };
      interviews.set(id, workspace);
      return workspace;
    },
    async revealPhone(context, id) {
      requireClaim(context, id);
      const item = queueAssignments.find((candidate) => candidate.id === id);
      if (!item) throw new Response("Assignment not found", { status: 404 });
      return { phone: item.syntheticPhone };
    },
    async getInterview(context, id) {
      requireClaim(context, id);
      const interview = interviews.get(id);
      if (interview) return interview;
      return this.startInterview(context, id);
    },
    async saveResponse(context, id) {
      requireClaim(context, id);
    },
    async addObservation(context, id) {
      requireClaim(context, id);
    },
    async completeInterview(context, id, outcome) {
      requireClaim(context, id);
      const current = await this.getInterview(context, id);
      interviews.set(id, { ...current, status: outcome });
      statuses.set(id, outcome === "completed" ? "reached" : "claimed");
    },
    async generateReport(_context, period) {
      return { reportId: `synthetic-report-${period}` };
    },
  };
}

let configuredService: OperationsApplicationService | undefined;
const syntheticService = createSyntheticService();

export function configureOperationsService(
  service: OperationsApplicationService,
): void {
  configuredService = service;
}

export function getOperationsService(): OperationsApplicationService {
  return configuredService ?? syntheticService;
}

export function getTenantContext(_request: Request): TenantContext {
  // Development-only identity. Production composition must derive this from the authenticated workforce session.
  return SYNTHETIC_CONTEXT;
}
