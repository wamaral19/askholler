import { describe, expect, it } from "vitest";

import { optionalR2ObjectStore } from "./twilio-server.server";

const r2 = {
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
};

describe("optionalR2ObjectStore", () => {
  it("disables recording transfer when R2 is not configured", () => {
    expect(optionalR2ObjectStore({})).toBeUndefined();
  });

  it("builds a store when R2 is fully configured", () => {
    expect(optionalR2ObjectStore(r2)).toBeDefined();
  });

  it("fails closed on partial configuration", () => {
    expect(() =>
      optionalR2ObjectStore({ ...r2, R2_SECRET_ACCESS_KEY: "" }),
    ).toThrow("R2_SECRET_ACCESS_KEY is required when R2 is configured");
  });
});
