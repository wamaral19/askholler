export type DeletionScope = "customer" | "shop" | "retention_expiry";
export interface DeletionRequestRecord {
  readonly id: string;
  readonly merchantId: string;
  readonly scope: DeletionScope;
  readonly subjectRefHash: string;
  readonly status:
    "pending" | "running" | "completed" | "blocked_legal_hold" | "failed";
  readonly legalHold: boolean;
}
export interface DeletionStep {
  readonly key: string;
  readonly delete: () => Promise<void>;
}
export interface DeletionRepository {
  getRequest(
    merchantId: string,
    requestId: string,
  ): Promise<DeletionRequestRecord | undefined>;
  begin(merchantId: string, requestId: string): Promise<void>;
  isStepComplete(
    merchantId: string,
    requestId: string,
    stepKey: string,
  ): Promise<boolean>;
  completeStep(
    merchantId: string,
    requestId: string,
    stepKey: string,
    completedAt: Date,
  ): Promise<void>;
  failStep(
    merchantId: string,
    requestId: string,
    stepKey: string,
    safeErrorCode: string,
  ): Promise<void>;
  complete(
    merchantId: string,
    requestId: string,
    completedAt: Date,
  ): Promise<void>;
}

/** Runs independently retryable erasure steps. Steps must be idempotent and must not log subject data. */
export class DeletionService {
  constructor(
    private readonly repository: DeletionRepository,
    private readonly clock: () => Date,
  ) {}
  async execute(
    merchantId: string,
    requestId: string,
    steps: readonly DeletionStep[],
  ): Promise<"completed" | "blocked_legal_hold"> {
    const request = await this.repository.getRequest(merchantId, requestId);
    if (!request) throw new Error("DELETION_REQUEST_NOT_FOUND");
    if (request.status === "completed") return "completed";
    if (request.legalHold) return "blocked_legal_hold";
    await this.repository.begin(merchantId, requestId);
    for (const step of steps) {
      if (await this.repository.isStepComplete(merchantId, requestId, step.key))
        continue;
      try {
        await step.delete();
        await this.repository.completeStep(
          merchantId,
          requestId,
          step.key,
          this.clock(),
        );
      } catch {
        await this.repository.failStep(
          merchantId,
          requestId,
          step.key,
          "ERASURE_STEP_FAILED",
        );
        throw new Error("DELETION_INCOMPLETE");
      }
    }
    await this.repository.complete(merchantId, requestId, this.clock());
    return "completed";
  }
}
