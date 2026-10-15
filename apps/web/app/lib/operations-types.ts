import type {
  MomentStatus,
  PrototypeResearchField,
  ResearchMomentSummary,
} from "./prototype-data";
import type { ScriptPrompt, WorkforceRole } from "@holler/domain";
import type { DashboardFilters, DashboardSnapshot } from "./analytics";
import type { PromptScope } from "./prompt-scope";

/** "declined": the customer asked not to be contacted again. */
export type InterviewOutcome = "completed" | "no_answer" | "declined";

/** Why a phone number was decrypted; recorded on the reveal audit event. */
export type PhoneRevealPurpose = "manual_dial" | "zapier_dial";

export interface TenantContext {
  /** The merchant this request acts on (the workforce's current selection). */
  readonly merchantId: string;
  /** Every merchant this workforce identity may select; includes merchantId. */
  readonly merchantIds: readonly string[];
  readonly researcherId: string;
  readonly correlationId: string;
  readonly roles: readonly WorkforceRole[];
}

export interface QueueItem {
  readonly id: string;
  readonly customerName: string;
  /** Shipping "City, ST"; null when unknown or not decryptable. */
  readonly locality: string | null;
  readonly maskedPhone: string;
  readonly merchant: string;
  readonly momentId: string;
  readonly moment: string;
  readonly eventAgeMinutes: number;
  /** When the customer placed the order (ISO 8601). */
  readonly orderedAt: string;
  readonly orderSequence: number;
  /** Shopify order name (e.g. "#1042"); null for orders ingested before capture. */
  readonly orderNumber: string | null;
  /** Numeric Shopify customer ID as shown in admin; null for guest checkouts. */
  readonly shopifyCustomerId: string | null;
  readonly orderTotal: string;
  readonly products: readonly string[];
  /** Units purchased across all lines of the order. */
  readonly itemCount: number;
  readonly observedAttribution: string;
  readonly priority: "urgent" | "standard";
  readonly status: "queued" | "claimed" | "dialing" | "reached";
  readonly claimedByResearcherId?: string;
  /** The signed-in researcher's interview for this order, once started. */
  readonly interviewId?: string;
  readonly lockVersion: number;
}

/** Who the researcher is about to call; decrypted only for the claimant. */
export interface CallSheetProfile {
  readonly firstName: string | null;
  /** "City, ST" */
  readonly locality: string | null;
  readonly shopifyCustomerId: string | null;
  readonly customerSince: string | null;
  readonly orderCount: number;
  readonly lifetimeValue: string | null;
  /** False when orders before Holler's install are not in this history. */
  readonly historyComplete: boolean;
}

export interface CallSheetOrderLine {
  readonly id: string;
  readonly product: string;
  readonly categories: readonly string[];
  /** Shopify variant title, e.g. "M / Navy". */
  readonly variant: string | null;
  readonly sku: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  /** Null when no discount applied. */
  readonly discount: string | null;
  readonly lineTotal: string;
  readonly refundedQuantity: number;
  readonly returnStatus: "kept" | "partially_returned" | "returned";
}

export interface CallSheetOrder {
  readonly id: string;
  readonly orderNumber: string | null;
  readonly orderedAt: string;
  readonly total: string;
  readonly discountTotal: string | null;
  readonly financialStatus: string | null;
  readonly fulfillmentStatus: string | null;
  readonly attribution: string;
  readonly lines: readonly CallSheetOrderLine[];
}

/** A script prompt or research field shown as one row on the call sheet. */
export interface CallSheetPrompt {
  /**
   * `script:<promptId>` or `field:<fieldVersionId>`; item prompts repeat per
   * line of the current order with `@line:<lineItemId>` appended.
   */
  readonly key: string;
  readonly kind: "script" | "field";
  readonly scope: PromptScope;
  /** The current-order line an item prompt is about. */
  readonly lineId: string | null;
  readonly title: string;
  readonly prompt: string;
  readonly options: readonly string[];
  readonly required: boolean;
  readonly covered: boolean;
  readonly selected: readonly string[];
  readonly note: string;
}

export interface PromptProgressInput {
  readonly covered: boolean;
  readonly selected: readonly string[];
  readonly note: string;
}

export interface InterviewWorkspace {
  readonly id: string;
  readonly assignment: QueueItem;
  readonly scriptName: string;
  readonly scriptVersion: number;
  readonly fieldSetVersion: number;
  readonly script: readonly ScriptPrompt[];
  readonly fields: readonly PrototypeResearchField[];
  /** Accepted responses for the pinned field-set version only. */
  readonly answeredFieldIds: readonly string[];
  readonly status:
    "dialing" | "reached" | "completed" | "no_answer" | "declined";
  readonly profile: CallSheetProfile;
  /** Earlier orders, newest first; excludes the current order. */
  readonly pastOrders: readonly CallSheetOrder[];
  readonly currentOrder: CallSheetOrder | null;
  readonly prompts: readonly CallSheetPrompt[];
}

export interface MerchantOption {
  readonly id: string;
  readonly name: string;
}

/** Statuses a published moment can move between; drafts launch via saveMoment. */
export type MomentRunStatus = Exclude<MomentStatus, "draft">;

/** Value types the live interview can capture; the editors offer only these. */
export type EditableFieldValueType = PrototypeResearchField["valueType"];

/** A research field at its newest published version, with merchant defaults. */
export interface LibraryResearchField extends PrototypeResearchField {
  /** research_fields.id, stable across edits; `id` is the newest version id. */
  readonly fieldId: string;
  readonly version: number;
  /** Merchant-owned fields can be reworded; platform wording stays fixed. */
  readonly editable: boolean;
  readonly archived: boolean;
  readonly includedByDefault: boolean;
  /** `required` is the merchant's required-by-default setting. */
  readonly displayOrder: number;
  readonly scope: PromptScope;
}

export interface ResearchFieldInput {
  readonly label: string;
  readonly prompt: string;
  readonly valueType: EditableFieldValueType;
  /** Option labels; used by single_select only. */
  readonly options: readonly string[];
  readonly scope: PromptScope;
}

/** One entry per field, in the new default order. */
export interface FieldDefaultInput {
  readonly fieldId: string;
  readonly includedByDefault: boolean;
  readonly requiredByDefault: boolean;
}

export interface LibraryScript {
  /** scripts.id */
  readonly id: string;
  readonly name: string;
  readonly versionId: string;
  readonly version: number;
  readonly prompts: readonly ScriptPrompt[];
  /** Platform scripts are copied into the merchant's library when edited. */
  readonly editable: boolean;
}

export interface SaveScriptInput {
  /** Omit to create a new library script. */
  readonly scriptId?: string;
  readonly name: string;
  readonly prompts: readonly ScriptPrompt[];
}

/** The script a moment's newest version pins. */
export interface MomentScript {
  readonly momentId: string;
  readonly momentName: string;
  readonly momentStatus: MomentStatus;
  readonly scriptName: string;
  readonly scriptVersion: number;
  /** True once the run has its own adapted copy of a library script. */
  readonly runSpecific: boolean;
  readonly prompts: readonly ScriptPrompt[];
}

export type MomentFieldSelection =
  | {
      readonly kind: "library";
      readonly fieldVersionId: string;
      readonly required: boolean;
    }
  | {
      /** Saved to the merchant's library so later runs can reuse it. */
      readonly kind: "new";
      readonly label: string;
      readonly prompt: string;
      readonly required: boolean;
      /** Defaults to "order". */
      readonly scope?: PromptScope;
    };

export interface SaveMomentInput {
  readonly name: string;
  readonly objective: string;
  readonly weeklyTarget: number;
  readonly cohortExpression: unknown;
  /** In interview order. */
  readonly fields: readonly MomentFieldSelection[];
  /** Omit to pin the newest library script unchanged. */
  readonly script?: {
    readonly baseScriptVersionId: string;
    readonly prompts: readonly ScriptPrompt[];
  };
  readonly publish: boolean;
}

export interface OperationsApplicationService {
  getDashboard(
    context: TenantContext,
    filters: DashboardFilters,
  ): Promise<DashboardSnapshot>;
  /** Newest version of each field, in the merchant's default order. */
  listResearchFields(
    context: TenantContext,
    options?: { readonly includeArchived?: boolean },
  ): Promise<readonly LibraryResearchField[]>;
  /** Creates a merchant field, or publishes a new version of one. */
  saveResearchField(
    context: TenantContext,
    fieldId: string | undefined,
    input: ResearchFieldInput,
  ): Promise<{ fieldId: string }>;
  setResearchFieldArchived(
    context: TenantContext,
    fieldId: string,
    archived: boolean,
  ): Promise<void>;
  saveFieldDefaults(
    context: TenantContext,
    defaults: readonly FieldDefaultInput[],
  ): Promise<void>;
  listScripts(context: TenantContext): Promise<readonly LibraryScript[]>;
  /** Publishes a new library script version. */
  saveScript(
    context: TenantContext,
    input: SaveScriptInput,
  ): Promise<{ scriptId: string }>;
  getMomentScript(
    context: TenantContext,
    momentId: string,
  ): Promise<MomentScript>;
  /**
   * Adapts the script for this run only by publishing a new moment version.
   * Assignments already queued keep the script they were created with.
   */
  updateMomentScript(
    context: TenantContext,
    momentId: string,
    prompts: readonly ScriptPrompt[],
  ): Promise<MomentScript>;
  listMerchants(context: TenantContext): Promise<readonly MerchantOption[]>;
  listMoments(
    context: TenantContext,
  ): Promise<readonly ResearchMomentSummary[]>;
  setMomentStatus(
    context: TenantContext,
    momentId: string,
    status: MomentRunStatus,
  ): Promise<ResearchMomentSummary>;
  saveMoment(
    context: TenantContext,
    input: SaveMomentInput,
  ): Promise<{ id: string }>;
  listQueue(context: TenantContext): Promise<readonly QueueItem[]>;
  claimAssignment(
    context: TenantContext,
    assignmentId: string,
    expectedLockVersion: number,
  ): Promise<QueueItem>;
  releaseAssignment(
    context: TenantContext,
    assignmentId: string,
    expectedLockVersion: number,
  ): Promise<QueueItem>;
  startInterview(
    context: TenantContext,
    assignmentId: string,
    expectedLockVersion: number,
  ): Promise<InterviewWorkspace>;
  revealPhone(
    context: TenantContext,
    assignmentId: string,
    purpose?: PhoneRevealPurpose,
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
  /** Saves one call-sheet row: covered state, tagged options, and note. */
  savePromptProgress(
    context: TenantContext,
    interviewId: string,
    promptKey: string,
    input: PromptProgressInput,
  ): Promise<void>;
  completeInterview(
    context: TenantContext,
    interviewId: string,
    outcome: InterviewOutcome,
  ): Promise<void>;
  generateReport(
    context: TenantContext,
    period: string,
  ): Promise<{ reportId: string }>;
}
