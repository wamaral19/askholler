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
import { action as momentsAction } from "./research-moments";
import { action as merchantAction } from "./workforce-merchant";

const merchantId = "00000000-0000-7000-8000-000000002001";
const researcherId = "00000000-0000-7000-8000-000000002002";
const assignment: QueueItem = {
  id: "00000000-0000-7000-8000-000000002003",
  customerName: "Synthetic customer",
  maskedPhone: "+1 ••• ••• 0123",
  merchant: "Synthetic merchant",
  momentId: "00000000-0000-7000-8000-000000002004",
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
    saveResearchField: vi.fn(async () => ({ fieldId: "field" })),
    setResearchFieldArchived: vi.fn(async () => undefined),
    saveFieldDefaults: vi.fn(async () => undefined),
    listScripts: vi.fn(async () => []),
    saveScript: vi.fn(async () => ({ scriptId: "script" })),
    getMomentScript: vi.fn(async () => {
      throw new Error("unused");
    }),
    updateMomentScript: vi.fn(async () => {
      throw new Error("unused");
    }),
    listMerchants: vi.fn(async () => []),
    listMoments: vi.fn(async () => []),
    setMomentStatus: vi.fn(async () => {
      throw new Error("unused");
    }),
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

  it("sends browser page requests without identity to sign in", async () => {
    configureOperationsService(service());
    configureWorkforceContextResolver(
      new SyntheticWorkforceContextResolver(new Map()),
    );
    const response = (await queueLoader({
      request: new Request("https://holler.invalid/queue?tab=mine"),
    }).catch((thrown: unknown) => thrown)) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/login?redirectTo=%2Fqueue%3Ftab%3Dmine",
    );
  });

  it("returns a safe 401 to header-authenticated clients", async () => {
    configureOperationsService(service());
    configureWorkforceContextResolver(
      new SyntheticWorkforceContextResolver(new Map()),
    );
    await expect(
      queueLoader({
        request: new Request("https://holler.invalid/queue", {
          headers: { "x-holler-workforce-session": "unknown-session" },
        }),
      }),
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

  function signedIn(extra: { merchantIds?: string[] } = {}) {
    configureWorkforceContextResolver(
      new SyntheticWorkforceContextResolver(
        new Map([
          [
            "route-session",
            {
              merchantId,
              researcherId,
              enabled: true,
              roles: ["researcher", "merchant_admin"],
              ...extra,
            },
          ],
        ]),
      ),
    );
  }

  function post(path: string, fields: Record<string, string>) {
    return new Request(`https://holler.invalid${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-holler-workforce-session": "route-session",
      },
      body: new URLSearchParams(fields),
    });
  }

  it("filters the queue to one live or paused moment", async () => {
    const stub = service();
    const other = { ...assignment, id: "other", momentId: "moment-other" };
    stub.listQueue = vi.fn(async () => [assignment, other]);
    stub.listMoments = vi.fn(async () =>
      (["live", "paused", "completed"] as const).map((status, index) => ({
        id: [assignment.momentId, "moment-other", "moment-done"][index]!,
        name: status,
        objective: "",
        status,
        trigger: "",
        cohortSummary: "",
        weeklyTarget: 1,
        fieldCount: 1,
        scriptVersion: "",
        completedThisWeek: 0,
      })),
    );
    configureOperationsService(stub);
    signedIn();
    const load = (query: string) =>
      queueLoader({
        request: new Request(`https://holler.invalid/queue${query}`, {
          headers: { "x-holler-workforce-session": "route-session" },
        }),
      });
    const filtered = await load(`?moment=${assignment.momentId}`);
    expect(filtered.assignments.map((item) => item.id)).toEqual([
      assignment.id,
    ]);
    expect(filtered.momentOptions.map((moment) => moment.status)).toEqual([
      "live",
      "paused",
    ]);
    // A completed moment is not a filter option, so it falls back to all.
    const unfiltered = await load("?moment=moment-done");
    expect(unfiltered.selectedMomentId).toBeNull();
    expect(unfiltered.assignments).toHaveLength(2);
  });

  it("validates moment status changes before calling the service", async () => {
    const stub = service();
    configureOperationsService(stub);
    signedIn();
    await expect(
      momentsAction({
        request: post("/moments", {
          intent: "set_status",
          momentId: "moment",
          status: "draft",
        }),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(stub.setMomentStatus).not.toHaveBeenCalled();
  });

  it("switches only to merchants the session allows", async () => {
    const otherMerchant = "00000000-0000-7000-8000-000000002005";
    configureOperationsService(service());
    signedIn({ merchantIds: [otherMerchant] });
    const response = (await merchantAction({
      request: post("/merchant", {
        merchantId: otherMerchant,
        redirectTo: "/interviews/abc",
      }),
    })) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/queue");
    expect(response.headers.get("set-cookie")).toContain(
      `holler_workforce_merchant=${otherMerchant}`,
    );
    await expect(
      merchantAction({
        request: post("/merchant", {
          merchantId: "00000000-0000-7000-8000-000000009999",
          redirectTo: "/queue",
        }),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
