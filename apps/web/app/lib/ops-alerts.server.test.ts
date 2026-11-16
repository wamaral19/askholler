import { describe, expect, it, vi } from "vitest";

import { sendOpsAlert, staffUrl } from "./ops-alerts.server";

describe("sendOpsAlert", () => {
  it("skips without a webhook URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await sendOpsAlert("hi", { env: {}, fetchImpl })).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the text as JSON", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 200 }),
    );
    const result = await sendOpsAlert("New install", {
      env: { OPS_ALERT_WEBHOOK_URL: "https://chat.example/hook" },
      fetchImpl,
    });
    expect(result).toBe("sent");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://chat.example/hook");
    expect(JSON.parse(String(init?.body))).toEqual({ text: "New install" });
  });

  it("reports failures without throwing", async () => {
    const env = { OPS_ALERT_WEBHOOK_URL: "https://chat.example/hook" };
    const rejected = vi.fn<typeof fetch>(
      async () => new Response("", { status: 500 }),
    );
    const thrown = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendOpsAlert("x", { env, fetchImpl: rejected })).toBe(
      "failed",
    );
    expect(await sendOpsAlert("x", { env, fetchImpl: thrown })).toBe("failed");
  });
});

describe("staffUrl", () => {
  it("joins APP_BASE_URL and the path", () => {
    expect(staffUrl("/moments", { APP_BASE_URL: "https://app.example/" })).toBe(
      "https://app.example/moments",
    );
    expect(staffUrl("/moments", {})).toBeNull();
  });
});
