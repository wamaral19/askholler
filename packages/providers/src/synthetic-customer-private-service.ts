import type {
  Clock,
  CustomerPrivateRevealRequest,
  CustomerPrivateRevealResult,
  CustomerPrivateService,
} from "@holler/domain";

export interface SyntheticPrivateCustomer {
  readonly merchantId: string;
  readonly customerId: string;
  readonly phoneE164: string;
}

export interface PhoneRevealAudit {
  readonly merchantId: string;
  readonly assignmentId: string;
  readonly customerId: string;
  readonly researcherId: string;
  readonly purpose: "manual_dial";
  readonly correlationId: string;
  readonly result: "allowed" | "denied";
  readonly reasonCode: "claim_authorized" | "claim_denied" | "not_found";
  readonly occurredAt: Date;
}

export interface SyntheticPhoneRevealAuthorization {
  isActiveClaim(input: {
    merchantId: string;
    assignmentId: string;
    customerId: string;
    researcherId: string;
  }): Promise<boolean>;
}

export interface PhoneRevealAuditSink {
  record(event: PhoneRevealAudit): Promise<void>;
}

export class SyntheticCustomerPrivateService implements CustomerPrivateService {
  readonly #customers = new Map<string, SyntheticPrivateCustomer>();

  constructor(
    customers: readonly SyntheticPrivateCustomer[],
    private readonly authorization: SyntheticPhoneRevealAuthorization,
    private readonly audit: PhoneRevealAuditSink,
    private readonly clock: Clock,
    private readonly revealTtlMs = 30_000,
  ) {
    for (const customer of customers) {
      if (!customer.phoneE164.startsWith("+120255501")) {
        throw new Error(
          "Synthetic customer phone must use the reserved 555-01xx range",
        );
      }
      this.#customers.set(
        this.#key(customer.merchantId, customer.customerId),
        customer,
      );
    }
  }

  async revealPhoneForClaimedAssignment(
    request: CustomerPrivateRevealRequest,
  ): Promise<CustomerPrivateRevealResult> {
    const occurredAt = this.clock.now();
    const customer = this.#customers.get(
      this.#key(request.merchantId, request.customerId),
    );
    const authorized =
      customer !== undefined &&
      (await this.authorization.isActiveClaim({
        merchantId: request.merchantId,
        assignmentId: request.assignmentId,
        customerId: request.customerId,
        researcherId: request.researcherId,
      }));

    await this.audit.record({
      ...request,
      result: authorized ? "allowed" : "denied",
      reasonCode: authorized
        ? "claim_authorized"
        : customer
          ? "claim_denied"
          : "not_found",
      occurredAt,
    });

    if (!authorized || !customer) {
      throw new Error("Phone reveal denied");
    }
    return {
      phoneE164: customer.phoneE164,
      expiresAt: new Date(occurredAt.getTime() + this.revealTtlMs),
    };
  }

  #key(merchantId: string, customerId: string): string {
    return `${merchantId}\u0000${customerId}`;
  }
}
