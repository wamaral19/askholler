import type {
  PrototypeResearchField,
  ResearchMomentSummary,
} from "./prototype-data";

export interface TenantContext {
  readonly merchantId: string;
  readonly researcherId: string;
}

export interface QueueItem {
  readonly id: string;
  readonly customerName: string;
  readonly maskedPhone: string;
  readonly merchant: string;
  readonly moment: string;
  readonly eventAgeMinutes: number;
  readonly orderSequence: number;
  readonly orderTotal: string;
  readonly products: readonly string[];
  readonly observedAttribution: string;
  readonly priority: "urgent" | "standard";
  readonly status: "queued" | "claimed" | "dialing" | "reached";
  readonly claimedByResearcherId?: string;
}

export interface InterviewWorkspace {
  readonly id: string;
  readonly assignment: QueueItem;
  readonly scriptName: string;
  readonly scriptVersion: number;
  readonly fieldSetVersion: number;
  readonly script: readonly { id: string; title: string; prompt: string }[];
  readonly fields: readonly PrototypeResearchField[];
  readonly status: "dialing" | "reached" | "completed" | "no_answer";
}

export interface SaveMomentInput {
  readonly name: string;
  readonly objective: string;
  readonly weeklyTarget: number;
  readonly cohortExpression: unknown;
  readonly fieldIds: readonly string[];
  readonly customFields: readonly string[];
  readonly publish: boolean;
}

export interface OperationsApplicationService {
  listMoments(
    context: TenantContext,
  ): Promise<readonly ResearchMomentSummary[]>;
  saveMoment(
    context: TenantContext,
    input: SaveMomentInput,
  ): Promise<{ id: string }>;
  listQueue(context: TenantContext): Promise<readonly QueueItem[]>;
  claimAssignment(
    context: TenantContext,
    assignmentId: string,
  ): Promise<QueueItem>;
  releaseAssignment(
    context: TenantContext,
    assignmentId: string,
  ): Promise<QueueItem>;
  startInterview(
    context: TenantContext,
    assignmentId: string,
  ): Promise<InterviewWorkspace>;
  revealPhone(
    context: TenantContext,
    assignmentId: string,
  ): Promise<{ phone: string }>;
  getInterview(
    context: TenantContext,
    interviewId: string,
  ): Promise<InterviewWorkspace>;
  saveResponse(
    context: TenantContext,
    interviewId: string,
    fieldId: string,
    value: string,
  ): Promise<void>;
  addObservation(
    context: TenantContext,
    interviewId: string,
    kind: string,
    detail: string,
  ): Promise<void>;
  completeInterview(
    context: TenantContext,
    interviewId: string,
    outcome: "completed" | "no_answer",
  ): Promise<void>;
  generateReport(
    context: TenantContext,
    period: string,
  ): Promise<{ reportId: string }>;
}
