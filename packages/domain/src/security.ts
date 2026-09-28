export const workforceRoles = [
  "researcher",
  "research_manager",
  "analyst",
  "merchant_admin",
  "platform_admin",
] as const;
export type WorkforceRole = (typeof workforceRoles)[number];

export const workforcePermissions = [
  "queue:read",
  "assignment:claim",
  "customer_phone:reveal",
  "interview:write",
  "evidence:review",
  "report:publish",
  "export:create",
  "tenant:manage",
  "deletion:manage",
  "legal_hold:manage",
] as const;
export type WorkforcePermission = (typeof workforcePermissions)[number];

const grants: Readonly<
  Record<WorkforceRole, ReadonlySet<WorkforcePermission>>
> = {
  researcher: new Set([
    "queue:read",
    "assignment:claim",
    "customer_phone:reveal",
    "interview:write",
  ]),
  research_manager: new Set([
    "queue:read",
    "assignment:claim",
    "customer_phone:reveal",
    "interview:write",
    "evidence:review",
  ]),
  analyst: new Set(["evidence:review", "report:publish", "export:create"]),
  merchant_admin: new Set([
    "report:publish",
    "export:create",
    "tenant:manage",
    "deletion:manage",
  ]),
  platform_admin: new Set(workforcePermissions),
};

export interface WorkforcePrincipal {
  readonly userId: string;
  readonly merchantId: string;
  readonly roles: readonly WorkforceRole[];
  readonly authenticatedAt: Date;
  readonly mfaVerifiedAt: Date;
  readonly sessionExpiresAt: Date;
}

export class AuthorizationError extends Error {
  constructor(
    readonly code:
      | "SESSION_EXPIRED"
      | "MFA_REQUIRED"
      | "TENANT_DENIED"
      | "PERMISSION_DENIED",
  ) {
    super(code);
    this.name = "AuthorizationError";
  }
}

export function authorizeWorkforce(input: {
  principal: WorkforcePrincipal;
  merchantId: string;
  permission: WorkforcePermission;
  now: Date;
  maximumMfaAgeMs: number;
}): void {
  if (input.principal.sessionExpiresAt <= input.now)
    throw new AuthorizationError("SESSION_EXPIRED");
  if (
    input.principal.merchantId !== input.merchantId &&
    !input.principal.roles.includes("platform_admin")
  )
    throw new AuthorizationError("TENANT_DENIED");
  if (
    input.now.getTime() - input.principal.mfaVerifiedAt.getTime() >
    input.maximumMfaAgeMs
  )
    throw new AuthorizationError("MFA_REQUIRED");
  if (!input.principal.roles.some((role) => grants[role].has(input.permission)))
    throw new AuthorizationError("PERMISSION_DENIED");
}

/** Adapter implemented by the selected OIDC provider. It must verify signature, issuer, audience, expiry and MFA claims. */
export interface WorkforceIdentityProvider {
  verifySession(token: string, now: Date): Promise<WorkforcePrincipal>;
}
