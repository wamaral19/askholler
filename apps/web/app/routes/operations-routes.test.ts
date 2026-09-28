import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  OperationsApplicationService,
  QueueItem,
} from "../lib/operations-types";
import {
  configureOperationsService,
  configureWorkforceContextResolver,
  resetOperationsCompositionForTests,
} from "../lib/operations-service.server";
import { SyntheticWorkforceContextResolver } from "../lib/workforce-session.server";
import { action as queueAction, loader as queueLoader } from "./research-queue";

const merchantId = "00000000-0000-7000-8000-000000002001";
const researcherId = "00000000-0000-7000-8000-000000002002";
const assignment: QueueItem = {
  id: "00000000-0000-7000-8000-000000002003",
  customerName: "Synthetic customer",
  maskedPhone: "+1 ••• ••• 0123",
  merchant: "Synthetic merchant",
  moment: "Synthetic moment",
  eventAgeMinutes: 1,
  orderSequence: 1,
  orderTotal: "$10.00",
  products: ["Synthetic product"],
  observedAttribution: "direct",
  priority: "standard",
  status: "claimed",
  claimedByResearcherId: researcherId,
  lockVersion: 1,
};

function service(): OperationsApplicationService {
  return {
    getDashboard: vi.fn(async (_context, filters) => ({
      filters,
      metrics: {
        orders: 0,
        revenueMinor: 0,
        currency: "USD",
        newCustomers: 0,
        repeatCustomers: 0,
        refundedOrders: 0,
        repurchaseRate: 0,
      },
      attribution: [],
      cohortExpression: { all: [] },
      limitations: [],
    })),
    listResearchFields: vi.fn(async () => []),
    listMoments: vi.fn(async () => []),
    saveMoment: vi.fn(async () => ({ id: "moment" })),
    listQueue: vi.fn(async () => [assignment]),
    claimAssignment: vi.fn(async () => assignment),
    releaseAssignment: vi.fn(async () => assignment),
    startInterview: vi.fn(async () => ({
      id: assignment.id,
      assignment,
      scriptName: "Synthetic",
      scriptVersion: 1,
      fieldSetVersion: 1,
      script: [],
      fields: [],
      answeredFieldIds: [],
      status: "dialing" as const,
    })),
    revealPhone: vi.fn(async () => ({ phone: "+12025550123" })),
    getInterview: vi.fn(async () => {
      throw new Error("unused");
    }),
    saveResponse: vi.fn(async () => undefined),
    addObservation: vi.fn(async () => undefined),
    completeInterview: vi.fn(async () => undefined),
    generateReport: vi.fn(async () => ({ reportId: "report" })),
  };
}

function request(intent: string, extra: Record<string, string> = {}) {
  const body = new URLSearchParams({
    intent,
    assignmentId: assignment.id,
    lockVersion: "1",
    ...extra,
  });
  return new Request("https://holler.invalid/queue", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-holler-workforce-session": "route-session",
    },
    body,
  });
}

describe("operations routes", () => {
  afterEach(() => resetOperationsCompositionForTests());

  it("returns a safe 401 when workforce identity is missing", async () => {
    configureOperationsService(service());
    configureWorkforceContextResolver(
      new SyntheticWorkforceContextResolver(new Map()),
    );
    await expect(
      queueLoader({ request: new Request("https://holler.invalid/queue") }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("does not accept tenant IDs from form data and marks reveal no-store", async () => {
    const stub = service();
    configureOperationsService(stub);
    configureWorkforceContextResolver(
      new SyntheticWorkforceContextResolver(
        new Map([
          [
            "route-session",
            { merchantId, researcherId, enabled: true, roles: ["researcher"] },
          ],
        ]),
      ),
    );
    const response = await queueAction({
      request: request("reveal", {
        merchantId: "00000000-0000-7000-8000-000000009999",
      }),
    });
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(stub.revealPhone).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId, researcherId }),
      assignment.id,
    );
  });

  it("passes the submitted optimistic lock version to claim", async () => {
    const stub = service();
    configureOperationsService(stub);
    configureWorkforceContextResolver(
      new SyntheticWorkforceContextResolver(
        new Map([
          [
            "route-session",
            { merchantId, researcherId, enabled: true, roles: ["researcher"] },
          ],
        ]),
      ),
    );
    await queueAction({ request: request("claim") });
    expect(stub.claimAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId, researcherId }),
      assignment.id,
      1,
    );
  });
});
