import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { safeRedirectPath } from "../lib/workforce-session.server";
import { action, loader } from "./workforce-login";

const token = "dev-session-token-123";

function signIn(
  fields: Record<string, string>,
  url = "http://localhost/login",
) {
  return action({
    request: new Request(url, {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
    params: {},
    context: {},
  } as never);
}

describe("workforce login", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "HOLLER_SYNTHETIC_WORKFORCE_SESSIONS",
      JSON.stringify({
        [token]: {
          merchantId: "00000000-0000-7000-8000-000000003001",
          researcherId: "00000000-0000-7000-8000-000000003002",
          roles: ["researcher"],
          enabled: true,
        },
        "disabled-session-token": {
          merchantId: "00000000-0000-7000-8000-000000003001",
          researcherId: "00000000-0000-7000-8000-000000003003",
          roles: ["researcher"],
          enabled: false,
        },
      }),
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sets an HttpOnly session cookie and returns to the requested page", async () => {
    const response = (await signIn({
      token,
      redirectTo: "/moments/new",
    })) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/moments/new");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`holler_workforce_session=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("marks the cookie Secure behind HTTPS", async () => {
    const response = (await signIn(
      { token },
      "https://tunnel.example/login",
    )) as Response;
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("rejects unknown and disabled tokens without a cookie", async () => {
    for (const candidate of ["not-a-real-token", "disabled-session-token"]) {
      const result = await signIn({ token: candidate });
      expect(result).toEqual({
        error: "That session token is not configured or is disabled.",
      });
    }
  });

  it("clears the cookie on sign-out", async () => {
    const response = (await signIn({ intent: "sign-out" })) as Response;
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("is unavailable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      loader({
        request: new Request("http://localhost/login"),
        params: {},
        context: {},
      } as never),
    ).toThrow();
  });

  it("only redirects to same-origin paths", () => {
    expect(safeRedirectPath("/queue?x=1")).toBe("/queue?x=1");
    expect(safeRedirectPath("https://evil.example")).toBe("/queue");
    expect(safeRedirectPath("//evil.example")).toBe("/queue");
    expect(safeRedirectPath("/\\evil.example")).toBe("/queue");
    expect(safeRedirectPath(null)).toBe("/queue");
  });
});
