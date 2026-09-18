import { describe, expect, it } from "vitest";
import {
  SyntheticCustomerPrivateService,
  type PhoneRevealAudit,
} from "./synthetic-customer-private-service";

const request = {
  merchantId: "merchant-a",
  assignmentId: "assignment-a",
  customerId: "customer-a",
  researcherId: "researcher-a",
  purpose: "manual_dial" as const,
  correlationId: "correlation-a",
};

describe("SyntheticCustomerPrivateService", () => {
  it("reveals only for an active claim and audits without the phone", async () => {
    const audits: PhoneRevealAudit[] = [];
    const service = new SyntheticCustomerPrivateService(
      [
        {
          merchantId: "merchant-a",
          customerId: "customer-a",
          phoneE164: "+12025550142",
        },
      ],
      { isActiveClaim: async () => true },
      { record: async (event) => void audits.push(event) },
      { now: () => new Date("2026-09-17T14:02:05.000Z") },
    );

    await expect(
      service.revealPhoneForClaimedAssignment(request),
    ).resolves.toEqual({
      phoneE164: "+12025550142",
      expiresAt: new Date("2026-09-17T14:02:35.000Z"),
    });
    expect(JSON.stringify(audits)).not.toContain("+12025550142");
    expect(audits[0]?.result).toBe("allowed");
  });

  it("fails closed and audits a denied cross-claim reveal", async () => {
    const audits: PhoneRevealAudit[] = [];
    const service = new SyntheticCustomerPrivateService(
      [
        {
          merchantId: "merchant-a",
          customerId: "customer-a",
          phoneE164: "+12025550142",
        },
      ],
      { isActiveClaim: async () => false },
      { record: async (event) => void audits.push(event) },
      { now: () => new Date("2026-09-17T14:02:05.000Z") },
    );

    await expect(
      service.revealPhoneForClaimedAssignment(request),
    ).rejects.toThrow("Phone reveal denied");
    expect(audits[0]).toMatchObject({
      result: "denied",
      reasonCode: "claim_denied",
    });
  });
});
