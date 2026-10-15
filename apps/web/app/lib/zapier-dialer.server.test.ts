import { describe, expect, it, vi } from "vitest";

import { sendZapierDialRequest, ZapierDialError } from "./zapier-dialer.server";

const request = {
  interviewId: "00000000-0000-7000-8000-000000000601",
  researcherId: "00000000-0000-7000-8000-000000000002",
  phone: "+12025550123",
  orderNumber: "#1042",
  merchant: "Juniper Row",
  moment: "Repeat purchase",
};

describe("sendZapierDialRequest", () => {
  it("posts the call request to the configured Catch Hook", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await sendZapierDialRequest(request, {
      env: { ZAPIER_DIAL_WEBHOOK_URL: "https://hooks.zapier.invalid/catch" },
      fetchImpl,
      now: () => new Date("2026-10-01T15:00:00.000Z"),
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://hooks.zapier.invalid/catch");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      event: "holler.call_requested",
      requestedAt: "2026-10-01T15:00:00.000Z",
      ...request,
    });
  });

  it("fails closed without a webhook URL", async () => {
    const fetchImpl = vi.fn();
    await expect(
      sendZapierDialRequest(request, { env: {}, fetchImpl }),
    ).rejects.toEqual(new ZapierDialError("ZAPIER_NOT_CONFIGURED"));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports rejected and unreachable hooks the same way", async () => {
    const env = { ZAPIER_DIAL_WEBHOOK_URL: "https://hooks.zapier.invalid/x" };
    await expect(
      sendZapierDialRequest(request, {
        env,
        fetchImpl: async () => new Response("", { status: 410 }),
      }),
    ).rejects.toMatchObject({ code: "ZAPIER_REJECTED" });
    await expect(
      sendZapierDialRequest(request, {
        env,
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    ).rejects.toMatchObject({ code: "ZAPIER_REJECTED" });
  });
});
