import { randomUUID } from "node:crypto";

import type { TenantContext } from "./operations-types";
import { workforceRoles, type WorkforceRole } from "@holler/domain";

export const WORKFORCE_SESSION_COOKIE = "holler_workforce_session";
export const WORKFORCE_MERCHANT_COOKIE = "holler_workforce_merchant";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_TOKEN = /^[A-Za-z0-9._~-]{8,160}$/;
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface SyntheticWorkforceSession {
  /** Default merchant; always selectable. */
  readonly merchantId: string;
  /** Additional merchants this identity may switch to. */
  readonly merchantIds?: readonly string[];
  readonly researcherId: string;
  readonly enabled: boolean;
  readonly roles: readonly WorkforceRole[];
}

export interface WorkforceContextResolver {
  resolve(request: Request): TenantContext | Promise<TenantContext>;
}

export class WorkforceContextError extends Error {
  constructor(
    readonly code:
      | "WORKFORCE_IDENTITY_REQUIRED"
      | "WORKFORCE_IDENTITY_INVALID"
      | "WORKFORCE_IDENTITY_DISABLED",
    readonly status: 401 | 403,
  ) {
    super(code);
    this.name = "WorkforceContextError";
  }
}

/**
 * Non-production adapter for the synthetic workforce. The browser supplies
 * only an opaque session token; merchant/researcher identity always comes from
 * the server-side allowlist. Replace this boundary with OIDC before launch.
 */
export class SyntheticWorkforceContextResolver implements WorkforceContextResolver {
  constructor(
    private readonly sessions: ReadonlyMap<string, SyntheticWorkforceSession>,
  ) {}

  resolve(request: Request): TenantContext {
    const token =
      request.headers.get("x-holler-workforce-session") ??
      this.cookie(request.headers.get("cookie"), WORKFORCE_SESSION_COOKIE);
    if (!token)
      throw new WorkforceContextError("WORKFORCE_IDENTITY_REQUIRED", 401);
    if (!SESSION_TOKEN.test(token))
      throw new WorkforceContextError("WORKFORCE_IDENTITY_INVALID", 401);
    const session = this.sessions.get(token);
    if (!session)
      throw new WorkforceContextError("WORKFORCE_IDENTITY_INVALID", 401);
    if (!session.enabled)
      throw new WorkforceContextError("WORKFORCE_IDENTITY_DISABLED", 403);
    const requestId = request.headers.get("x-request-id");
    const merchantIds = [
      ...new Set([session.merchantId, ...(session.merchantIds ?? [])]),
    ];
    // The selection cookie is a preference, never an authority: it only
    // chooses among merchants the server-side session already allows.
    const selected = this.cookie(
      request.headers.get("cookie"),
      WORKFORCE_MERCHANT_COOKIE,
    );
    return {
      merchantId:
        selected && merchantIds.includes(selected)
          ? selected
          : session.merchantId,
      merchantIds,
      researcherId: session.researcherId,
      roles: session.roles,
      correlationId:
        requestId && UUID.test(requestId) ? requestId : randomUUID(),
    };
  }

  private cookie(header: string | null, name: string): string | undefined {
    return header
      ?.split(";")
      .map((part) => part.trim().split("="))
      .find(([key]) => key === name)?.[1];
  }
}

export function syntheticSessionsFromEnvironment(
  environment: NodeJS.ProcessEnv,
): ReadonlyMap<string, SyntheticWorkforceSession> {
  const raw = environment.HOLLER_SYNTHETIC_WORKFORCE_SESSIONS;
  if (!raw) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Invalid HOLLER_SYNTHETIC_WORKFORCE_SESSIONS configuration",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(
      "Invalid HOLLER_SYNTHETIC_WORKFORCE_SESSIONS configuration",
    );
  const sessions = new Map<string, SyntheticWorkforceSession>();
  for (const [token, value] of Object.entries(parsed)) {
    const configuredRoles = (value as Record<string, unknown> | undefined)
      ?.roles;
    if (
      !SESSION_TOKEN.test(token) ||
      !value ||
      typeof value !== "object" ||
      typeof (value as Record<string, unknown>).merchantId !== "string" ||
      typeof (value as Record<string, unknown>).researcherId !== "string" ||
      typeof (value as Record<string, unknown>).enabled !== "boolean" ||
      !Array.isArray(configuredRoles) ||
      !configuredRoles.every((role: unknown) =>
        workforceRoles.includes(role as WorkforceRole),
      )
    )
      throw new Error(
        "Invalid HOLLER_SYNTHETIC_WORKFORCE_SESSIONS configuration",
      );
    const session = value as Record<string, unknown>;
    if (
      !UUID.test(String(session.merchantId)) ||
      !UUID.test(String(session.researcherId)) ||
      (session.merchantIds !== undefined &&
        (!Array.isArray(session.merchantIds) ||
          !session.merchantIds.every(
            (id: unknown) => typeof id === "string" && UUID.test(id),
          )))
    )
      throw new Error(
        "Invalid HOLLER_SYNTHETIC_WORKFORCE_SESSIONS configuration",
      );
    sessions.set(token, value as unknown as SyntheticWorkforceSession);
  }
  return sessions;
}

/** Whether a token names an enabled synthetic session (used by /login). */
export function isUsableSyntheticToken(
  sessions: ReadonlyMap<string, SyntheticWorkforceSession>,
  token: string,
): boolean {
  return SESSION_TOKEN.test(token) && sessions.get(token)?.enabled === true;
}

function isSecureRequest(request: Request): boolean {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

export function workforceSessionCookie(
  request: Request,
  token: string,
): string {
  return [
    `${WORKFORCE_SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(isSecureRequest(request) ? ["Secure"] : []),
  ].join("; ");
}

export function workforceMerchantCookie(
  request: Request,
  merchantId: string,
): string {
  return [
    `${WORKFORCE_MERCHANT_COOKIE}=${merchantId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(isSecureRequest(request) ? ["Secure"] : []),
  ].join("; ");
}

export function clearWorkforceMerchantCookie(request: Request): string {
  return [
    `${WORKFORCE_MERCHANT_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(isSecureRequest(request) ? ["Secure"] : []),
  ].join("; ");
}

export function clearWorkforceSessionCookie(request: Request): string {
  return [
    `${WORKFORCE_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(isSecureRequest(request) ? ["Secure"] : []),
  ].join("; ");
}

/** Only same-origin absolute paths; anything else falls back to the queue. */
export function safeRedirectPath(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
    ? value
    : "/queue";
}
