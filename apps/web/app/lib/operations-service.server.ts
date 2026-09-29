import {
  pinnedScript,
  queueAssignments,
  researchFields,
  researchMoments,
} from "./prototype-data";
import type {
  InterviewWorkspace,
  LibraryResearchField,
  LibraryScript,
  MomentScript,
  OperationsApplicationService,
  QueueItem,
  TenantContext,
} from "./operations-types";
import type { MomentStatus } from "./prototype-data";
import { canManageMoments, canTransitionMoment } from "./moment-status";
import {
  canViewCommerceDashboard,
  dashboardFiltersToCohort,
} from "./analytics";
import { createDatabase } from "@holler/db";
import { redirect } from "react-router";
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
  merchantIds: ["merchant-synthetic-northstar"],
  researcherId: "researcher-synthetic-001",
  correlationId: "synthetic-memory-request",
  roles: ["researcher"],
};

function createSyntheticService(): OperationsApplicationService {
  const statuses = new Map<string, QueueItem["status"]>();
  const interviews = new Map<string, InterviewWorkspace>();
  const answers = new Map<string, Set<string>>();
  const momentStatuses = new Map<string, MomentStatus>(
    researchMoments.map((moment) => [moment.id, moment.status]),
  );
  const moments = () =>
    researchMoments.map((moment) => ({
      ...moment,
      status: momentStatuses.get(moment.id) ?? moment.status,
    }));

  let fieldLibrary: LibraryResearchField[] = researchFields.map(
    (field, index) => ({
      ...field,
      source:
        field.source === "platform_default"
          ? field.source
          : ("merchant_default" as const),
      fieldId: field.id,
      version: 1,
      editable: field.source !== "platform_default",
      archived: false,
      includedByDefault: field.source !== "research_run",
      displayOrder: index,
    }),
  );
  let scriptLibrary: LibraryScript[] = [
    {
      id: "script-repeat-purchase",
      name: "Repeat purchase",
      versionId: "script-repeat-purchase-v3",
      version: 3,
      prompts: pinnedScript,
      editable: true,
    },
  ];
  const momentScripts = new Map<string, MomentScript>();
  const requireManager = (context: TenantContext) => {
    if (!canManageMoments(context.roles))
      throw new Response("Moment manager role required", { status: 403 });
  };
  const findField = (fieldId: string) => {
    const field = fieldLibrary.find((item) => item.fieldId === fieldId);
    if (!field) throw new Response("Field not found", { status: 404 });
    if (!field.editable)
      throw new Response("Platform field wording is locked", { status: 403 });
    return field;
  };

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
    async listResearchFields(_context, options = {}) {
      return fieldLibrary
        .filter((field) => options.includeArchived || !field.archived)
        .sort((a, b) => a.displayOrder - b.displayOrder);
    },
    async saveResearchField(context, fieldId, input) {
      requireManager(context);
      const wording = {
        label: input.label.trim(),
        prompt: input.prompt.trim(),
        valueType: input.valueType,
        ...(input.valueType === "single_select"
          ? { options: input.options }
          : {}),
      };
      if (!wording.label || !wording.prompt)
        throw Response.json(
          { error: { code: "INVALID_RESEARCH_FIELD" } },
          { status: 400 },
        );
      if (fieldId) {
        const current = findField(fieldId);
        const version = current.version + 1;
        const { options: _options, ...rest } = current;
        fieldLibrary = fieldLibrary.map((field) =>
          field === current
            ? { ...rest, ...wording, id: `${fieldId}-v${version}`, version }
            : field,
        );
        return { fieldId };
      }
      const id = `field-${fieldLibrary.length + 1}`;
      fieldLibrary = [
        ...fieldLibrary,
        {
          ...wording,
          id,
          fieldId: id,
          version: 1,
          source: "merchant_default",
          required: false,
          editable: true,
          archived: false,
          includedByDefault: true,
          displayOrder: fieldLibrary.length,
        },
      ];
      return { fieldId: id };
    },
    async setResearchFieldArchived(context, fieldId, archived) {
      requireManager(context);
      const current = findField(fieldId);
      fieldLibrary = fieldLibrary.map((field) =>
        field === current ? { ...field, archived } : field,
      );
    },
    async saveFieldDefaults(context, defaults) {
      requireManager(context);
      fieldLibrary = fieldLibrary.map((field) => {
        const index = defaults.findIndex(
          (item) => item.fieldId === field.fieldId,
        );
        const item = defaults[index];
        return item
          ? {
              ...field,
              includedByDefault: item.includedByDefault,
              required: item.requiredByDefault,
              displayOrder: index,
            }
          : field;
      });
    },
    async listScripts() {
      return scriptLibrary;
    },
    async saveScript(context, input) {
      requireManager(context);
      const current = scriptLibrary.find(
        (script) => script.id === input.scriptId,
      );
      if (current) {
        const version = current.version + 1;
        scriptLibrary = scriptLibrary.map((script) =>
          script === current
            ? {
                ...script,
                name: input.name,
                prompts: input.prompts,
                version,
                versionId: `${script.id}-v${version}`,
              }
            : script,
        );
        return { scriptId: current.id };
      }
      const id = `script-${scriptLibrary.length + 1}`;
      scriptLibrary = [
        ...scriptLibrary,
        {
          id,
          name: input.name,
          versionId: `${id}-v1`,
          version: 1,
          prompts: input.prompts,
          editable: true,
        },
      ];
      return { scriptId: id };
    },
    async getMomentScript(_context, momentId) {
      const moment = moments().find((candidate) => candidate.id === momentId);
      if (!moment) throw new Response("Moment not found", { status: 404 });
      return (
        momentScripts.get(momentId) ?? {
          momentId,
          momentName: moment.name,
          momentStatus: moment.status,
          scriptName: "Repeat purchase",
          scriptVersion: 3,
          runSpecific: false,
          prompts: pinnedScript,
        }
      );
    },
    async updateMomentScript(context, momentId, prompts) {
      requireManager(context);
      const current = await this.getMomentScript(context, momentId);
      const next: MomentScript = {
        ...current,
        scriptName: `${current.momentName} script`,
        scriptVersion: current.runSpecific ? current.scriptVersion + 1 : 1,
        runSpecific: true,
        prompts,
      };
      momentScripts.set(momentId, next);
      return next;
    },
    async listMerchants(context) {
      return context.merchantIds.map((id, index) => ({
        id,
        name:
          index === 0
            ? "Northstar Outfitters — synthetic"
            : `Synthetic merchant ${index + 1}`,
      }));
    },
    async listMoments() {
      return moments();
    },
    async setMomentStatus(context, momentId, status) {
      if (!canManageMoments(context.roles))
        throw new Response("Moment manager role required", { status: 403 });
      const moment = moments().find((candidate) => candidate.id === momentId);
      if (!moment) throw new Response("Moment not found", { status: 404 });
      if (!canTransitionMoment(moment.status, status))
        throw new Response("Invalid moment transition", { status: 409 });
      momentStatuses.set(momentId, status);
      return { ...moment, status };
    },
    async saveMoment(_context, input) {
      return { id: `moment-${input.publish ? "published" : "draft"}` };
    },
    async listQueue() {
      // Completed moments stop feeding the queue; work already claimed stays.
      return queueAssignments
        .map((item) => queueItem(item.id))
        .filter(
          (item) =>
            item.status !== "queued" ||
            momentStatuses.get(item.momentId) !== "completed",
        );
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
    if (
      error instanceof WorkforceContextError &&
      error.status === 401 &&
      isBrowserPageRequest(request)
    ) {
      const url = new URL(request.url);
      throw redirect(
        `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`,
      );
    }
    if (error instanceof WorkforceContextError)
      throw Response.json(
        { error: { code: error.code } },
        { status: error.status },
      );
    throw error;
  }
}

/**
 * Browser pages send people to /login; API routes and header-authenticated
 * clients keep the JSON 401 they can handle programmatically.
 */
function isBrowserPageRequest(request: Request): boolean {
  return (
    !request.headers.has("x-holler-workforce-session") &&
    !new URL(request.url).pathname.startsWith("/api/")
  );
}
