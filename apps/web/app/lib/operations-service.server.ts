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
import {
  canViewCommerceDashboard,
  dashboardFiltersToCohort,
} from "./analytics";
import { createDatabase } from "@holler/db";
import {
  OperationsError,
  PostgresOperationsApplicationService,
  PrefixedSyntheticPhoneDecryptor,
} from "./postgres-operations-service.server";
import {
  SyntheticWorkforceContextResolver,
  WorkforceContextError,
  syntheticSessionsFromEnvironment,
  type WorkforceContextResolver,
} from "./workforce-session.server";

export async function executeOperationsRequest<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof OperationsError)
      throw Response.json(
        { error: { code: error.code } },
        { status: error.status },
      );
    throw Response.json(
      { error: { code: "OPERATIONS_INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}

const SYNTHETIC_CONTEXT: TenantContext = {
  merchantId: "merchant-synthetic-northstar",
  researcherId: "researcher-synthetic-001",
  correlationId: "synthetic-memory-request",
  roles: ["researcher"],
};

function createSyntheticService(): OperationsApplicationService {
  const statuses = new Map<string, QueueItem["status"]>();
  const interviews = new Map<string, InterviewWorkspace>();
  const answers = new Map<string, Set<string>>();

  const queueItem = (id: string): QueueItem => {
    const item = queueAssignments.find((candidate) => candidate.id === id);
    if (!item) throw new Response("Assignment not found", { status: 404 });
    const { syntheticPhone: _phone, ...safe } = item;
    const status = statuses.get(id) ?? "queued";
    return {
      ...safe,
      status,
      lockVersion: status === "queued" ? 0 : 1,
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
    async getDashboard(context, filters) {
      if (!canViewCommerceDashboard(context.roles))
        throw new Response("Admin role required", { status: 403 });
      return {
        filters,
        metrics: {
          orders: 42,
          revenueMinor: 518400,
          currency: "USD",
          newCustomers: 24,
          repeatCustomers: 18,
          refundedOrders: 2,
          repurchaseRate: 42.86,
        },
        attribution: [
          { source: "meta", orders: 17 },
          { source: "google", orders: 12 },
          { source: "direct", orders: 8 },
          { source: "unknown", orders: 5 },
        ],
        cohortExpression: dashboardFiltersToCohort(filters),
        limitations: [
          "Discount metrics require normalized discount data and are not shown.",
          "Synthetic dashboard values are illustrative.",
        ],
      };
    },
    async listResearchFields() {
      return researchFields;
    },
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
        answeredFieldIds: [...(answers.get(id) ?? [])],
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
      const assignment = requireClaim(context, id);
      const interview = interviews.get(id);
      if (interview) return interview;
      return this.startInterview(context, id, assignment.lockVersion);
    },
    async saveResponse(context, id, fieldId) {
      requireClaim(context, id);
      const current = answers.get(id) ?? new Set<string>();
      current.add(fieldId);
      answers.set(id, current);
      const interview = interviews.get(id);
      if (interview)
        interviews.set(id, { ...interview, answeredFieldIds: [...current] });
    },
    async addObservation(context, id) {
      requireClaim(context, id);
    },
    async completeInterview(context, id, outcome) {
      requireClaim(context, id);
      const current = await this.getInterview(context, id);
      if (
        outcome === "completed" &&
        current.fields.some(
          (field) =>
            field.required && !current.answeredFieldIds.includes(field.id),
        )
      )
        throw new Response("Interview is missing required responses", {
          status: 409,
        });
      interviews.set(id, { ...current, status: outcome });
      statuses.set(id, outcome === "completed" ? "reached" : "claimed");
    },
    async generateReport(_context, period) {
      return { reportId: `synthetic-report-${period}` };
    },
  };
}

let configuredService: OperationsApplicationService | undefined;
let constructedService: OperationsApplicationService | undefined;
let configuredContextResolver: WorkforceContextResolver | undefined;

export function configureOperationsService(
  service: OperationsApplicationService,
): void {
  configuredService = service;
}

export function resetOperationsCompositionForTests(): void {
  configuredService = undefined;
  constructedService = undefined;
  configuredContextResolver = undefined;
}

export function getOperationsService(): OperationsApplicationService {
  if (configuredService) return configuredService;
  if (constructedService) return constructedService;
  const mode = process.env.HOLLER_OPERATIONS_MODE;
  if (mode === "synthetic-memory") {
    constructedService = createSyntheticService();
    return constructedService;
  }
  if (mode !== "synthetic-postgres") {
    throw new Error(
      "HOLLER_OPERATIONS_MODE must explicitly select synthetic-postgres or synthetic-memory",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required for synthetic-postgres mode");
  const { db } = createDatabase(databaseUrl);
  constructedService = new PostgresOperationsApplicationService(
    db,
    new PrefixedSyntheticPhoneDecryptor(),
  );
  return constructedService;
}

export function configureWorkforceContextResolver(
  resolver: WorkforceContextResolver,
): void {
  configuredContextResolver = resolver;
}

export function getTenantContext(request: Request): TenantContext {
  const resolver =
    configuredContextResolver ??
    new SyntheticWorkforceContextResolver(
      syntheticSessionsFromEnvironment(process.env),
    );
  try {
    return resolver.resolve(request);
  } catch (error) {
    if (error instanceof WorkforceContextError)
      throw Response.json(
        { error: { code: error.code } },
        { status: error.status },
      );
    throw error;
  }
}
