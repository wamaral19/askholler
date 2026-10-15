import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import { safeRedirectPath } from "./workforce-session.server";

export const GOOGLE_ISSUER = "https://accounts.google.com" as const;
const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
export const OIDC_FLOW_COOKIE = "holler_oidc_flow";
const FLOW_MAX_AGE_SECONDS = 10 * 60;

export interface GoogleOidcConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Absolute callback URL registered on the Google OAuth client. */
  readonly redirectUri: string;
  /** Workspace domain whose verified accounts may sign in. */
  readonly allowedDomain: string;
}

export interface GoogleOidcDependencies {
  readonly fetch: typeof fetch;
  readonly keys: JWTVerifyGetKey;
}

export interface VerifiedGoogleIdentity {
  readonly issuer: typeof GOOGLE_ISSUER;
  readonly subject: string;
  /** Lowercased, verified, and inside the allowed Workspace domain. */
  readonly email: string;
}

export class GoogleSignInError extends Error {
  constructor(
    readonly code:
      | "OIDC_FLOW_INVALID"
      | "OIDC_TOKEN_EXCHANGE_FAILED"
      | "OIDC_ID_TOKEN_INVALID"
      | "OIDC_DOMAIN_DENIED",
  ) {
    super(code);
    this.name = "GoogleSignInError";
  }
}

interface FlowState {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly redirectTo: string;
}

export function googleOidcConfigFromEnvironment(
  environment: NodeJS.ProcessEnv,
): GoogleOidcConfig {
  const clientId = environment.OIDC_AUDIENCE;
  const clientSecret = environment.GOOGLE_OAUTH_CLIENT_SECRET;
  const baseUrl = environment.APP_BASE_URL;
  const allowedDomain = environment.WORKFORCE_ALLOWED_DOMAIN;
  if (
    environment.OIDC_ISSUER !== GOOGLE_ISSUER ||
    !clientId ||
    !clientSecret ||
    !baseUrl ||
    !allowedDomain
  )
    throw new Error(
      "Google sign-in requires OIDC_ISSUER, OIDC_AUDIENCE, GOOGLE_OAUTH_CLIENT_SECRET, APP_BASE_URL, and WORKFORCE_ALLOWED_DOMAIN",
    );
  return {
    clientId,
    clientSecret,
    redirectUri: new URL("/login/google/callback", baseUrl).toString(),
    allowedDomain: allowedDomain.toLowerCase(),
  };
}

let defaultKeys: JWTVerifyGetKey | undefined;
export function defaultGoogleOidcDependencies(): GoogleOidcDependencies {
  defaultKeys ??= createRemoteJWKSet(new URL(JWKS_URI));
  return { fetch, keys: defaultKeys };
}

/** Starts the authorization-code + PKCE flow; returns Google's URL and the flow cookie. */
export function beginGoogleSignIn(
  config: GoogleOidcConfig,
  request: Request,
  redirectTo: unknown,
): { location: string; cookie: string } {
  const flow: FlowState = {
    state: randomToken(),
    nonce: randomToken(),
    verifier: randomToken(),
    redirectTo: safeRedirectPath(redirectTo),
  };
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: "openid email",
    redirect_uri: config.redirectUri,
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256")
      .update(flow.verifier)
      .digest("base64url"),
    code_challenge_method: "S256",
    // A UI hint only; the ID token's hd claim is what is enforced.
    hd: config.allowedDomain,
    prompt: "select_account",
  }).toString();
  return {
    location: url.toString(),
    cookie: flowCookie(
      request,
      Buffer.from(JSON.stringify(flow)).toString("base64url"),
      FLOW_MAX_AGE_SECONDS,
    ),
  };
}

/** Verifies the callback, exchanges the code, and validates the ID token. */
export async function completeGoogleSignIn(
  config: GoogleOidcConfig,
  dependencies: GoogleOidcDependencies,
  request: Request,
): Promise<{ identity: VerifiedGoogleIdentity; redirectTo: string }> {
  const flow = readFlow(request);
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!flow || !code || !state || !safeEqual(state, flow.state))
    throw new GoogleSignInError("OIDC_FLOW_INVALID");

  const response = await dependencies.fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: flow.verifier,
    }),
  });
  if (!response.ok) throw new GoogleSignInError("OIDC_TOKEN_EXCHANGE_FAILED");
  const body = (await response.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string")
    throw new GoogleSignInError("OIDC_TOKEN_EXCHANGE_FAILED");

  let claims: Record<string, unknown>;
  try {
    ({ payload: claims } = await jwtVerify(body.id_token, dependencies.keys, {
      issuer: [GOOGLE_ISSUER, "accounts.google.com"],
      audience: config.clientId,
    }));
  } catch {
    throw new GoogleSignInError("OIDC_ID_TOKEN_INVALID");
  }
  if (
    typeof claims.sub !== "string" ||
    typeof claims.nonce !== "string" ||
    !safeEqual(claims.nonce, flow.nonce)
  )
    throw new GoogleSignInError("OIDC_ID_TOKEN_INVALID");
  const email =
    typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  if (
    claims.email_verified !== true ||
    claims.hd !== config.allowedDomain ||
    !email.endsWith(`@${config.allowedDomain}`)
  )
    throw new GoogleSignInError("OIDC_DOMAIN_DENIED");
  return {
    identity: { issuer: GOOGLE_ISSUER, subject: claims.sub, email },
    redirectTo: flow.redirectTo,
  };
}

export function clearOidcFlowCookie(request: Request): string {
  return flowCookie(request, "", 0);
}

function readFlow(request: Request): FlowState | undefined {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === OIDC_FLOW_COOKIE)?.[1];
  if (!raw) return undefined;
  try {
    const flow = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<FlowState>;
    return typeof flow.state === "string" &&
      typeof flow.nonce === "string" &&
      typeof flow.verifier === "string"
      ? {
          state: flow.state,
          nonce: flow.nonce,
          verifier: flow.verifier,
          redirectTo: safeRedirectPath(flow.redirectTo),
        }
      : undefined;
  } catch {
    return undefined;
  }
}

function flowCookie(request: Request, value: string, maxAge: number): string {
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  return [
    `${OIDC_FLOW_COOKIE}=${value}`,
    "Path=/login/google",
    "HttpOnly",
    // Lax lets the cookie ride Google's top-level redirect back to us.
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
