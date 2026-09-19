import { randomUUID } from "node:crypto";

import type { TenantContext } from "./operations-types";

export interface SyntheticWorkforceSession {
  readonly merchantId: string;
  readonly researcherId: string;
  readonly enabled: boolean;
}

export interface WorkforceContextResolver {
  resolve(request: Request): TenantContext;
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
      this.cookie(request.headers.get("cookie"), "holler_workforce_session");
    if (!token)
      throw new WorkforceContextError("WORKFORCE_IDENTITY_REQUIRED", 401);
    if (!/^[A-Za-z0-9._~-]{8,160}$/.test(token))
      throw new WorkforceContextError("WORKFORCE_IDENTITY_INVALID", 401);
    const session = this.sessions.get(token);
    if (!session)
      throw new WorkforceContextError("WORKFORCE_IDENTITY_INVALID", 401);
    if (!session.enabled)
      throw new WorkforceContextError("WORKFORCE_IDENTITY_DISABLED", 403);
    const requestId = request.headers.get("x-request-id");
    return {
      merchantId: session.merchantId,
      researcherId: session.researcherId,
      correlationId:
        requestId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          requestId,
        )
          ? requestId
          : randomUUID(),
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
    if (
      !/^[A-Za-z0-9._~-]{8,160}$/.test(token) ||
      !value ||
      typeof value !== "object" ||
      typeof (value as Record<string, unknown>).merchantId !== "string" ||
      typeof (value as Record<string, unknown>).researcherId !== "string" ||
      typeof (value as Record<string, unknown>).enabled !== "boolean"
    )
      throw new Error(
        "Invalid HOLLER_SYNTHETIC_WORKFORCE_SESSIONS configuration",
      );
    const session = value as Record<string, unknown>;
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      !uuid.test(String(session.merchantId)) ||
      !uuid.test(String(session.researcherId))
    )
      throw new Error(
        "Invalid HOLLER_SYNTHETIC_WORKFORCE_SESSIONS configuration",
      );
    sessions.set(token, value as unknown as SyntheticWorkforceSession);
  }
  return sessions;
}
