import {
  createIsolatedTestDatabase,
  persistedCanonicalIds as ids,
  seedPersistedCanonicalFlow,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GOOGLE_ISSUER } from "./google-oidc.server";
import { isMerchantPortalPath } from "./merchant-context.server";
import {
  MERCHANT_PORTAL_SESSION_COOKIE,
  MERCHANT_PORTAL_SESSION_TTL_MS,
  MerchantPortalDirectory,
  authenticatePortalMerchant,
  merchantPortalSessionCookie,
  normalizeLoginDomain,
  safePortalRedirectPath,
} from "./merchant-portal-auth.server";
import { completePortalSignIn } from "./merchant-portal-sign-in.server";

const databaseUrl = testDatabaseUrl();

function identity(email: string, subject = `sub-${email}`) {
  return {
    issuer: GOOGLE_ISSUER,
    subject,
    email,
    hostedDomain: email.split("@")[1]!,
  };
}

function portalRequest(path: string, token?: string) {
  const headers = new Headers();
  if (token)
    headers.set("cookie", `${MERCHANT_PORTAL_SESSION_COOKIE}=${token}`);
  return new Request(`https://app.holler.invalid${path}`, { headers });
}

describe("merchant portal rules", () => {
  it("accepts company domains and refuses shared mail providers and Holler's own", () => {
    expect(normalizeLoginDomain(" @Acme.COM ")).toBe("acme.com");
    expect(normalizeLoginDomain("shop.acme.co.uk")).toBe("shop.acme.co.uk");
    for (const domain of [
      "gmail.com",
      "outlook.com",
      "withholler.com",
      "myshopify.com",
      "not a domain",
      "acme",
      "-acme.com",
    ])
      expect(() => normalizeLoginDomain(domain)).toThrow(
        "PORTAL_DOMAIN_INVALID",
      );
  });

  it("only redirects within the portal, never back to sign-in", () => {
    expect(safePortalRedirectPath("/portal/calls?research=1")).toBe(
      "/portal/calls?research=1",
    );
    for (const value of [
      "/queue",
      "//evil.example/portal",
      "https://evil.example/portal",
      "/portalx",
      "/portal/login/google",
      "/portal/..\\evil",
      null,
    ])
      expect(safePortalRedirectPath(value)).toBe("/portal");
  });

  it("serves the portal only under /portal", () => {
    expect(isMerchantPortalPath("/portal")).toBe(true);
    expect(isMerchantPortalPath("/portal/calls/1")).toBe(true);
    expect(isMerchantPortalPath("/portalx")).toBe(false);
    expect(isMerchantPortalPath("/app/calls")).toBe(false);
  });

  it("scopes the session cookie to the portal", () => {
    const cookie = merchantPortalSessionCookie(
      portalRequest("/portal/login/google/callback"),
      "t",
    );
    expect(cookie).toContain("Path=/portal;");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("sends a signed-out page to sign-in and a signed-out recording fetch a 401", async () => {
    const page = await authenticatePortalMerchant(
      portalRequest("/portal/calls?research=1"),
    ).catch((thrown: Response) => thrown);
    expect((page as Response).status).toBe(302);
    expect((page as Response).headers.get("Location")).toBe(
      "/portal/login?redirectTo=%2Fportal%2Fcalls%3Fresearch%3D1",
    );
    const recording = await authenticatePortalMerchant(
      portalRequest("/portal/calls/abc/recording"),
    ).catch((thrown: Response) => thrown);
    expect((recording as Response).status).toBe(401);
  });

  it("clears the flow cookie and logs only a code when the callback fails", async () => {
    vi.stubEnv("MERCHANT_PORTAL_GOOGLE_CLIENT_ID", "client");
    vi.stubEnv("MERCHANT_PORTAL_GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("APP_BASE_URL", "https://app.holler.invalid");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const signIn = vi.fn();
      // No flow cookie, so Google is never called and no session starts.
      const response = await completePortalSignIn(
        portalRequest("/portal/login/google/callback?code=x&state=y"),
        { fetch: vi.fn() as unknown as typeof fetch, keys: vi.fn() },
        { signIn } as unknown as MerchantPortalDirectory,
      );
      expect(signIn).not.toHaveBeenCalled();
      expect(response.headers.get("Location")).toBe(
        "/portal/login?error=failed",
      );
      expect(response.headers.get("Set-Cookie")).toContain(
        "Path=/portal/login/google",
      );
      expect(warn.mock.calls).toEqual([
        [
          JSON.stringify({
            event: "merchant_portal.sign_in_failed",
            code: "OIDC_FLOW_INVALID",
          }),
        ],
      ]);
    } finally {
      warn.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

describe.skipIf(databaseUrl === undefined)("merchant portal sign-in", () => {
  let isolated: IsolatedTestDatabase;
  let directory: MerchantPortalDirectory;
  let now = new Date("2026-11-09T12:00:00Z");

  beforeAll(async () => {
    isolated = await createIsolatedTestDatabase(databaseUrl!);
    await seedPersistedCanonicalFlow(isolated.db);
    directory = new MerchantPortalDirectory(isolated.db, () => now);
  }, 30_000);

  afterAll(async () => isolated?.close());

  it("refuses anyone whose domain is not registered", async () => {
    await expect(
      directory.signIn(identity("buyer@unknown.example")),
    ).rejects.toMatchObject({ code: "PORTAL_DOMAIN_NOT_REGISTERED" });
  });

  it("admits a registered domain as that merchant's read-only viewer", async () => {
    await directory.addDomain(ids.merchant, "Acme.example");
    const token = await directory.signIn(identity("buyer@acme.example"));
    const { context, session } = await authenticatePortalMerchant(
      portalRequest("/portal", token),
      directory,
    );
    expect(context).toMatchObject({
      merchantId: ids.merchant,
      merchantIds: [ids.merchant],
      roles: [],
      viewer: "merchant",
    });
    expect(session.email).toBe("buyer@acme.example");
    // Each person gets their own stable audit actor.
    const again = await directory.signIn(identity("buyer@acme.example"));
    const other = await directory.signIn(identity("owner@acme.example"));
    expect((await directory.resolveSession(again)).actorId).toBe(
      session.actorId,
    );
    expect((await directory.resolveSession(other)).actorId).not.toBe(
      session.actorId,
    );
    // Only the hash is stored.
    const rows = await isolated.db.execute(
      sql`select token_hash from merchant_portal_sessions`,
    );
    expect(JSON.stringify(rows.rows)).not.toContain(token);
  });

  it("never moves a domain to another merchant without removing it first", async () => {
    const otherMerchant = "00000000-0000-7000-8000-00000000a001";
    await isolated.db.execute(sql`
      insert into merchants (id, name, timezone, status)
      values (${otherMerchant}, 'Other Store', 'America/New_York', 'active')`);
    await expect(
      directory.addDomain(otherMerchant, "acme.example"),
    ).rejects.toMatchObject({ code: "PORTAL_DOMAIN_TAKEN" });
    await expect(
      directory.addDomain(
        "00000000-0000-7000-8000-00000000ffff",
        "new.example",
      ),
    ).rejects.toMatchObject({ code: "PORTAL_MERCHANT_NOT_FOUND" });
  });

  it("ends access when the domain is removed, the session expires, or the user signs out", async () => {
    await directory.addDomain(ids.merchant, "gone.example");
    const removed = await directory.signIn(identity("a@gone.example"));
    await directory.removeDomain("gone.example");
    await expect(directory.resolveSession(removed)).rejects.toMatchObject({
      code: "PORTAL_SESSION_REQUIRED",
    });
    await expect(
      directory.signIn(identity("a@gone.example")),
    ).rejects.toMatchObject({ code: "PORTAL_DOMAIN_NOT_REGISTERED" });

    const expiring = await directory.signIn(identity("c@acme.example"));
    now = new Date(now.getTime() + MERCHANT_PORTAL_SESSION_TTL_MS + 1);
    await expect(directory.resolveSession(expiring)).rejects.toMatchObject({
      code: "PORTAL_SESSION_REQUIRED",
    });

    const signedOut = await directory.signIn(identity("d@acme.example"));
    await directory.revokeSession(signedOut);
    await expect(directory.resolveSession(signedOut)).rejects.toMatchObject({
      code: "PORTAL_SESSION_REQUIRED",
    });
  });

  it("lists registered domains with their merchant", async () => {
    expect(await directory.listDomains()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "acme.example",
          merchantId: ids.merchant,
          status: "active",
        }),
        expect.objectContaining({ domain: "gone.example", status: "removed" }),
      ]),
    );
  });
});
