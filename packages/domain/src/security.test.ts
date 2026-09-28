import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  authorizeWorkforce,
  type WorkforcePrincipal,
} from "./security";
const now = new Date("2026-09-24T12:00:00Z");
const principal: WorkforcePrincipal = {
  userId: "00000000-0000-7000-8000-000000000001",
  merchantId: "00000000-0000-7000-8000-000000000002",
  roles: ["researcher"],
  authenticatedAt: new Date("2026-09-24T11:00:00Z"),
  mfaVerifiedAt: new Date("2026-09-24T11:55:00Z"),
  sessionExpiresAt: new Date("2026-09-24T13:00:00Z"),
};
describe("workforce authorization", () => {
  it("allows a granted tenant permission with recent MFA", () =>
    expect(() =>
      authorizeWorkforce({
        principal,
        merchantId: principal.merchantId,
        permission: "customer_phone:reveal",
        now,
        maximumMfaAgeMs: 900_000,
      }),
    ).not.toThrow());
  it("fails closed for tenant, MFA, and role violations", () => {
    expect(() =>
      authorizeWorkforce({
        principal,
        merchantId: "00000000-0000-7000-8000-000000000099",
        permission: "queue:read",
        now,
        maximumMfaAgeMs: 900_000,
      }),
    ).toThrowError(new AuthorizationError("TENANT_DENIED"));
    expect(() =>
      authorizeWorkforce({
        principal,
        merchantId: principal.merchantId,
        permission: "queue:read",
        now,
        maximumMfaAgeMs: 1,
      }),
    ).toThrowError(new AuthorizationError("MFA_REQUIRED"));
    expect(() =>
      authorizeWorkforce({
        principal,
        merchantId: principal.merchantId,
        permission: "deletion:manage",
        now,
        maximumMfaAgeMs: 900_000,
      }),
    ).toThrowError(new AuthorizationError("PERMISSION_DENIED"));
  });
});
