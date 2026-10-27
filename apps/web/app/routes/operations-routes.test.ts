import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { action as interviewAction } from "./live-interview";

const merchantId = "00000000-0000-7000-8000-000000002001";
const researcherId = "00000000-0000-7000-8000-000000002002";
const assignment: QueueItem = {
  id: "00000000-0000-7000-8000-000000002003",
  customerName: "Synthetic customer",
  locality: "Portland, OR",
  maskedPhone: "+1 ••• ••• 0123",
  merchant: "Synthetic merchant",
  general: false,
  momentId: "00000000-0000-7000-8000-000000002004",
  moment: "Synthetic moment",
  eventAgeMinutes: 1,
  orderedAt: "2026-10-15T16:00:00.000Z",
  orderSequence: 1,
  orderNumber: "#1001",
  shopifyCustomerId: "900000000101",
  orderTotal: "$10.00",
  products: ["Synthetic product"],
  itemCount: 1,
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
      repeatByProduct: [],
      series: [],
      sources: [],
      topProducts: [],
      reorderTiming: {
        leaderProduct: null,
        leaderCustomers: 0,
        otherCustomers: 0,
        buckets: [],
      },
      cohorts: [],
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
    getGeneralCalls: vi.fn(async () => null),
    getMomentConfiguration: vi.fn(async () => {
      throw new Error("unused");
    }),
    deleteMoment: vi.fn(async () => undefined),
    setMomentStatus: vi.fn(async () => {
      throw new Error("unused");
    }),
    saveMoment: vi.fn(async () => ({ id: "moment" })),
    listCompletedRuns: vi.fn(async () => []),
    setMomentReportUrl: vi.fn(async () => undefined),
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
      profile: {
        firstName: "Avery",
        locality: "Portland, OR",
        shopifyCustomerId: "900000000101",
        customerSince: null,
        orderCount: 1,
        lifetimeValue: null,
        historyComplete: true,
      },
      pastOrders: [],
      currentOrder: null,
      prompts: [],
    })),
    revealPhone: vi.fn(async () => ({ phone: "+12025550123" })),
    getInterview: vi.fn(async () => {
      throw new Error("unused");
    }),
    saveResponse: vi.fn(async () => undefined),
    addObservation: vi.fn(async () => undefined),
    savePromptProgress: vi.fn(async () => undefined),
    completeInterview: vi.fn(async () => undefined),
    listCompletedCalls: vi.fn(async () => []),
    getCallReview: vi.fn(),
    reviewPromptProgress: vi.fn(async () => undefined),
    getRecordingObjectKey: vi.fn(async () => null),
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

  it("opens a queued order by claiming it and starting the interview", async () => {
    const stub = service();
    stub.claimAssignment = vi.fn(async () => ({
      ...assignment,
      lockVersion: 2,
    }));
    configureOperationsService(stub);
    signedIn();
    const response = await queueAction({
      request: post("/queue", {
        intent: "open",
        assignmentId: assignment.id,
        lockVersion: "1",
        status: "queued",
      }),
    });
    expect(stub.claimAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId, researcherId }),
      assignment.id,
      1,
    );
    expect(stub.startInterview).toHaveBeenCalledWith(
      expect.anything(),
      assignment.id,
      2,
    );
    expect((response as Response).status).toBe(302);
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

  it("offers live and paused angles as queue filters", async () => {
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
    const board = await queueLoader({
      request: new Request("https://holler.invalid/queue", {
        headers: { "x-holler-workforce-session": "route-session" },
      }),
    });
    expect(board.angles.map((angle) => angle.status)).toEqual([
      "live",
      "paused",
    ]);
    expect(board.assignments).toHaveLength(2);
    expect(board.researcherId).toBe(researcherId);
    expect(board.liveCount).toBe(1);
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

  describe("live interview calling", () => {
    const interviewId = "00000000-0000-7000-8000-000000002006";
    const workspace = {
      id: interviewId,
      assignment,
      scriptName: "Synthetic",
      scriptVersion: 1,
      fieldSetVersion: 1,
      script: [],
      fields: [],
      answeredFieldIds: [],
      status: "dialing" as const,
      profile: {
        firstName: "Avery",
        locality: "Portland, OR",
        shopifyCustomerId: "900000000101",
        customerSince: null,
        orderCount: 1,
        lifetimeValue: null,
        historyComplete: true,
      },
      pastOrders: [],
      currentOrder: null,
      prompts: [],
    };
    const interviewPost = (intent: string) =>
      interviewAction({
        request: post(`/interviews/${interviewId}`, { intent }),
        params: { interviewId },
      });

    beforeEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("reveals the phone for the interview's assignment", async () => {
      const stub = service();
      stub.getInterview = vi.fn(async () => workspace);
      configureOperationsService(stub);
      signedIn();
      await interviewPost("reveal");
      expect(stub.revealPhone).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId, researcherId }),
        assignment.id,
      );
    });

    it("hands the call to Zapier after an audited reveal", async () => {
      vi.stubEnv("DIALER_PROVIDER", "zapier");
      vi.stubEnv(
        "ZAPIER_DIAL_WEBHOOK_URL",
        "https://hooks.zapier.invalid/catch",
      );
      const fetchMock = vi.fn(async () => new Response("{}"));
      vi.stubGlobal("fetch", fetchMock);
      const stub = service();
      stub.getInterview = vi.fn(async () => workspace);
      configureOperationsService(stub);
      signedIn();
      await expect(interviewPost("dial")).resolves.toEqual({
        intent: "dial",
        sent: true,
      });
      expect(stub.revealPhone).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId, researcherId }),
        assignment.id,
        "zapier_dial",
      );
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe("https://hooks.zapier.invalid/catch");
      expect(JSON.parse(String(init.body))).toMatchObject({
        interviewId,
        researcherId,
        phone: "+12025550123",
        orderNumber: "#1001",
      });
    });

    it("tells the researcher when Zapier rejects the call", async () => {
      vi.stubEnv("DIALER_PROVIDER", "zapier");
      vi.stubEnv(
        "ZAPIER_DIAL_WEBHOOK_URL",
        "https://hooks.zapier.invalid/catch",
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("", { status: 500 })),
      );
      const stub = service();
      stub.getInterview = vi.fn(async () => workspace);
      configureOperationsService(stub);
      signedIn();
      await expect(interviewPost("dial")).resolves.toEqual({
        intent: "dial",
        sent: false,
        error: "ZAPIER_REJECTED",
      });
    });

    it("refuses to dial when Zapier is not the dialer", async () => {
      vi.stubEnv("DIALER_PROVIDER", "fake");
      const stub = service();
      configureOperationsService(stub);
      signedIn();
      await expect(interviewPost("dial")).rejects.toMatchObject({
        status: 400,
      });
      expect(stub.revealPhone).not.toHaveBeenCalled();
    });

    it("saves a researcher note with or without tags", async () => {
      const stub = service();
      configureOperationsService(stub);
      signedIn();
      await interviewAction({
        request: post(`/interviews/${interviewId}`, {
          intent: "observation",
          detail: "Laughed when asked about price",
        }),
        params: { interviewId },
      });
      expect(stub.addObservation).toHaveBeenCalledWith(
        expect.objectContaining({ researcherId }),
        interviewId,
        "context",
        "Laughed when asked about price",
      );
      const tagged = new URLSearchParams({
        intent: "observation",
        detail: "Paused before answering",
      });
      tagged.append("kind", "hesitation");
      tagged.append("kind", "follow_up_needed");
      await interviewAction({
        request: new Request(
          `https://holler.invalid/interviews/${interviewId}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              "x-holler-workforce-session": "route-session",
            },
            body: tagged,
          },
        ),
        params: { interviewId },
      });
      expect(stub.addObservation).toHaveBeenCalledTimes(3);
      expect(stub.addObservation).toHaveBeenLastCalledWith(
        expect.anything(),
        interviewId,
        "follow_up_needed",
        "Paused before answering",
      );
    });

    it("records an unanswered call", async () => {
      const stub = service();
      configureOperationsService(stub);
      signedIn();
      await interviewPost("no_answer");
      expect(stub.completeInterview).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId, researcherId }),
        interviewId,
        "no_answer",
      );
    });
  });
});
