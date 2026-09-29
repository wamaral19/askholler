import { describe, expect, it } from "vitest";

import {
  SyntheticWorkforceContextResolver,
  WORKFORCE_MERCHANT_COOKIE,
  WorkforceContextError,
  syntheticSessionsFromEnvironment,
} from "./workforce-session.server";

const merchantId = "00000000-0000-7000-8000-000000000101";
const researcherId = "00000000-0000-7000-8000-000000000102";

describe("synthetic workforce context", () => {
  const resolver = new SyntheticWorkforceContextResolver(
    new Map([
      [
        "enabled-session",
        { merchantId, researcherId, enabled: true, roles: ["researcher"] },
      ],
      [
        "disabled-session",
        { merchantId, researcherId, enabled: false, roles: ["researcher"] },
      ],
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

  it("selects a merchant from the cookie only within the session allowlist", () => {
    const otherMerchant = "00000000-0000-7000-8000-000000000103";
    const unlisted = "00000000-0000-7000-8000-000000009999";
    const multi = new SyntheticWorkforceContextResolver(
      new Map([
        [
          "multi-session",
          {
            merchantId,
            merchantIds: [otherMerchant],
            researcherId,
            enabled: true,
            roles: ["researcher"],
          },
        ],
      ]),
    );
    const resolve = (selected?: string) =>
      multi.resolve(
        new Request("https://holler.invalid/queue", {
          headers: {
            "x-holler-workforce-session": "multi-session",
            ...(selected
              ? { cookie: `${WORKFORCE_MERCHANT_COOKIE}=${selected}` }
              : {}),
          },
        }),
      );
    expect(resolve()).toMatchObject({
      merchantId,
      merchantIds: [merchantId, otherMerchant],
    });
    expect(resolve(otherMerchant).merchantId).toBe(otherMerchant);
    expect(resolve(unlisted).merchantId).toBe(merchantId);
  });

  it("fails closed on malformed server configuration", () => {
    expect(() =>
      syntheticSessionsFromEnvironment({
        HOLLER_SYNTHETIC_WORKFORCE_SESSIONS: JSON.stringify({
          "enabled-session": {
            merchantId,
            merchantIds: ["not-a-uuid"],
            researcherId,
            enabled: true,
            roles: ["researcher"],
          },
        }),
      }),
    ).toThrow("Invalid HOLLER_SYNTHETIC_WORKFORCE_SESSIONS configuration");
    expect(() =>
      syntheticSessionsFromEnvironment({
        HOLLER_SYNTHETIC_WORKFORCE_SESSIONS: JSON.stringify({
          "enabled-session": {
            merchantId: "not-a-uuid",
            researcherId,
            enabled: true,
            roles: ["researcher"],
          },
        }),
      }),
    ).toThrow("Invalid HOLLER_SYNTHETIC_WORKFORCE_SESSIONS configuration");
  });
});
