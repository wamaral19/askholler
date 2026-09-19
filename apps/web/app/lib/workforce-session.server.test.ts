import { describe, expect, it } from "vitest";

import {
  SyntheticWorkforceContextResolver,
  WorkforceContextError,
  syntheticSessionsFromEnvironment,
} from "./workforce-session.server";

const merchantId = "00000000-0000-7000-8000-000000000101";
const researcherId = "00000000-0000-7000-8000-000000000102";

describe("synthetic workforce context", () => {
  const resolver = new SyntheticWorkforceContextResolver(
    new Map([
      ["enabled-session", { merchantId, researcherId, enabled: true }],
      ["disabled-session", { merchantId, researcherId, enabled: false }],
    ]),
  );

  it("rejects absent, malformed, unknown, and disabled identities", () => {
    const resolve = (token?: string) =>
      resolver.resolve(
        new Request("https://holler.invalid/queue", {
          headers: token ? { "x-holler-workforce-session": token } : {},
        }),
      );
    expect(() => resolve()).toThrowError(
      new WorkforceContextError("WORKFORCE_IDENTITY_REQUIRED", 401),
    );
    expect(() => resolve("bad token")).toThrowError(
      new WorkforceContextError("WORKFORCE_IDENTITY_INVALID", 401),
    );
    expect(() => resolve("unknown-session")).toThrowError(
      new WorkforceContextError("WORKFORCE_IDENTITY_INVALID", 401),
    );
    expect(() => resolve("disabled-session")).toThrowError(
      new WorkforceContextError("WORKFORCE_IDENTITY_DISABLED", 403),
    );
  });

  it("derives tenant and actor only from the server-side session map", () => {
    const context = resolver.resolve(
      new Request(
        "https://holler.invalid/queue?merchantId=00000000-0000-7000-8000-000000009999",
        {
          headers: {
            "x-holler-workforce-session": "enabled-session",
            "x-holler-merchant-id": "00000000-0000-7000-8000-000000009999",
          },
        },
      ),
    );
    expect(context).toMatchObject({ merchantId, researcherId });
  });

  it("fails closed on malformed server configuration", () => {
    expect(() =>
      syntheticSessionsFromEnvironment({
        HOLLER_SYNTHETIC_WORKFORCE_SESSIONS: JSON.stringify({
          "enabled-session": {
            merchantId: "not-a-uuid",
            researcherId,
            enabled: true,
          },
        }),
      }),
    ).toThrow("Invalid HOLLER_SYNTHETIC_WORKFORCE_SESSIONS configuration");
  });
});
