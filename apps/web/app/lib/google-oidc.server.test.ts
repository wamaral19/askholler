import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  GoogleSignInError,
  OIDC_FLOW_COOKIE,
  beginGoogleSignIn,
  completeGoogleSignIn,
  type GoogleOidcConfig,
  type GoogleOidcDependencies,
} from "./google-oidc.server";

const config: GoogleOidcConfig = {
  clientId: "synthetic-client.apps.googleusercontent.com",
  clientSecret: "synthetic-secret",
  redirectUri: "https://app.holler.invalid/login/google/callback",
  allowedDomain: "withholler.com",
};

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let keys: GoogleOidcDependencies["keys"];

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

function start(redirectTo = "/moments") {
  const request = new Request("https://app.holler.invalid/login/google");
  const { location, cookie } = beginGoogleSignIn(config, request, redirectTo);
  const url = new URL(location);
  const cookieValue = cookie.split(";")[0]!;
  const flow = JSON.parse(
    Buffer.from(cookieValue.split("=")[1]!, "base64url").toString(),
  ) as { state: string; nonce: string; verifier: string };
  return { url, cookie, cookieValue, flow };
}

async function idToken(claims: Record<string, unknown>) {
  return new SignJWT({
    email: "researcher@withholler.com",
    email_verified: true,
    hd: "withholler.com",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer("https://accounts.google.com")
    .setAudience(config.clientId)
    .setSubject("google-subject-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function callback(
  cookieValue: string | undefined,
  state: string,
  token: string,
) {
  const fetchMock = vi.fn(async () => Response.json({ id_token: token }));
  const request = new Request(
    `https://app.holler.invalid/login/google/callback?code=abc&state=${state}`,
    cookieValue ? { headers: { cookie: cookieValue } } : undefined,
  );
  return {
    fetchMock,
    result: completeGoogleSignIn(
      config,
      { fetch: fetchMock as unknown as typeof fetch, keys },
      request,
    ),
  };
}

describe("Google OIDC sign-in", () => {
  it("builds a PKCE authorization request with a scoped, HttpOnly flow cookie", () => {
    const { url, cookie } = start();
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("hd")).toBe("withholler.com");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(cookie).toContain(`${OIDC_FLOW_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/login/google");
    expect(cookie).toContain("Secure");
  });

  it("accepts a verified Workspace identity and returns the requested page", async () => {
    const { cookieValue, flow } = start("/queue");
    const { fetchMock, result } = callback(
      cookieValue,
      flow.state,
      await idToken({ nonce: flow.nonce }),
    );
    await expect(result).resolves.toEqual({
      identity: {
        issuer: "https://accounts.google.com",
        subject: "google-subject-1",
        email: "researcher@withholler.com",
      },
      redirectTo: "/queue",
    });
    const body = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1].body as URLSearchParams;
    expect(body.get("code_verifier")).toBe(flow.verifier);
  });

  it("rejects a missing flow cookie or mismatched state before calling Google", async () => {
    const { cookieValue, flow } = start();
    const token = await idToken({ nonce: flow.nonce });
    for (const attempt of [
      callback(undefined, flow.state, token),
      callback(cookieValue, "forged-state", token),
    ]) {
      await expect(attempt.result).rejects.toMatchObject({
        code: "OIDC_FLOW_INVALID",
      });
      expect(attempt.fetchMock).not.toHaveBeenCalled();
    }
  });

  it("rejects a replayed nonce and a token for another client", async () => {
    const { cookieValue, flow } = start();
    await expect(
      callback(cookieValue, flow.state, await idToken({ nonce: "other" }))
        .result,
    ).rejects.toMatchObject({ code: "OIDC_ID_TOKEN_INVALID" });
    const foreign = await new SignJWT({ nonce: flow.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("https://accounts.google.com")
      .setAudience("someone-else")
      .setSubject("google-subject-1")
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(
      callback(cookieValue, flow.state, foreign).result,
    ).rejects.toBeInstanceOf(GoogleSignInError);
  });

  it("rejects personal accounts, other domains, and unverified email", async () => {
    const { cookieValue, flow } = start();
    for (const claims of [
      { hd: undefined, email: "someone@gmail.com" },
      { hd: "example.com", email: "someone@example.com" },
      { email_verified: false },
    ]) {
      await expect(
        callback(
          cookieValue,
          flow.state,
          await idToken({ nonce: flow.nonce, ...claims }),
        ).result,
      ).rejects.toMatchObject({ code: "OIDC_DOMAIN_DENIED" });
    }
  });
});
