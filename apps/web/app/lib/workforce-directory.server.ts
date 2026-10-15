import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  merchantMemberships,
  workforceSessions,
  workforceUsers,
  type HollerDatabase,
} from "@holler/db";
import { workforceRoles, type WorkforceRole } from "@holler/domain";
import { and, eq, gt, isNull } from "drizzle-orm";

import type { VerifiedGoogleIdentity } from "./google-oidc.server";
import type { TenantContext } from "./operations-types";
import {
  WORKFORCE_MERCHANT_COOKIE,
  WORKFORCE_SESSION_COOKIE,
  WorkforceContextError,
  type WorkforceContextResolver,
} from "./workforce-session.server";

/** One working day; users sign in with Google again after it. */
export const WORKFORCE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class WorkforceSignInError extends Error {
  constructor(readonly code: "WORKFORCE_NOT_PROVISIONED") {
    super(code);
    this.name = "WorkforceSignInError";
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Workforce users, memberships, and sessions in PostgreSQL. Operators
 * provision users by Workspace email; the first Google sign-in binds the
 * OIDC subject. Every request re-reads user status, session revocation, and
 * memberships, so revocation takes effect immediately.
 */
export class WorkforceDirectory {
  constructor(
    private readonly db: HollerDatabase,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Creates a session for a verified identity; returns the opaque cookie token. */
  async signIn(identity: VerifiedGoogleIdentity): Promise<string> {
    const now = this.clock();
    return this.db.transaction(async (tx) => {
      let [user] = await tx
        .select()
        .from(workforceUsers)
        .where(
          and(
            eq(workforceUsers.oidcIssuer, identity.issuer),
            eq(workforceUsers.oidcSubject, identity.subject),
          ),
        )
        .for("update");
      if (!user) {
        // First sign-in: bind the provisioned email to this Google subject.
        [user] = await tx
          .update(workforceUsers)
          .set({
            oidcIssuer: identity.issuer,
            oidcSubject: identity.subject,
            updatedAt: now,
          })
          .where(
            and(
              eq(workforceUsers.email, identity.email),
              isNull(workforceUsers.oidcSubject),
            ),
          )
          .returning();
      }
      if (!user || user.status !== "active")
        throw new WorkforceSignInError("WORKFORCE_NOT_PROVISIONED");
      await tx
        .update(workforceUsers)
        .set({ lastLoginAt: now, updatedAt: now })
        .where(eq(workforceUsers.id, user.id));
      const token = randomBytes(32).toString("base64url");
      await tx.insert(workforceSessions).values({
        id: randomUUID(),
        tokenHash: hashSessionToken(token),
        userId: user.id,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + WORKFORCE_SESSION_TTL_MS),
      });
      return token;
    });
  }

  async revokeSession(token: string): Promise<void> {
    if (!SESSION_TOKEN.test(token)) return;
    await this.db
      .update(workforceSessions)
      .set({ revokedAt: this.clock() })
      .where(
        and(
          eq(workforceSessions.tokenHash, hashSessionToken(token)),
          isNull(workforceSessions.revokedAt),
        ),
      );
  }

  /** Resolves an active session to its grants, grouped by merchant. */
  async resolveSession(token: string): Promise<{
    userId: string;
    rolesByMerchant: ReadonlyMap<string, readonly WorkforceRole[]>;
  }> {
    if (!SESSION_TOKEN.test(token))
      throw new WorkforceContextError("WORKFORCE_IDENTITY_INVALID", 401);
    const [session] = await this.db
      .select({
        userId: workforceSessions.userId,
        userStatus: workforceUsers.status,
      })
      .from(workforceSessions)
      .innerJoin(
        workforceUsers,
        eq(workforceUsers.id, workforceSessions.userId),
      )
      .where(
        and(
          eq(workforceSessions.tokenHash, hashSessionToken(token)),
          isNull(workforceSessions.revokedAt),
          gt(workforceSessions.expiresAt, this.clock()),
        ),
      );
    if (!session)
      throw new WorkforceContextError("WORKFORCE_IDENTITY_INVALID", 401);
    if (session.userStatus !== "active")
      throw new WorkforceContextError("WORKFORCE_IDENTITY_DISABLED", 403);
    const memberships = await this.db
      .select({
        merchantId: merchantMemberships.merchantId,
        role: merchantMemberships.role,
      })
      .from(merchantMemberships)
      .where(
        and(
          eq(merchantMemberships.userId, session.userId),
          eq(merchantMemberships.status, "active"),
        ),
      )
      .orderBy(merchantMemberships.merchantId);
    const rolesByMerchant = new Map<string, WorkforceRole[]>();
    for (const { merchantId, role } of memberships) {
      if (!workforceRoles.includes(role as WorkforceRole)) continue;
      rolesByMerchant.set(merchantId, [
        ...(rolesByMerchant.get(merchantId) ?? []),
        role as WorkforceRole,
      ]);
    }
    return { userId: session.userId, rolesByMerchant };
  }

  // Operator administration (scripts/workforce.ts). No UI for the pilot.

  async provisionUser(email: string): Promise<string> {
    const normalized = normalizeEmail(email);
    const now = this.clock();
    const [existing] = await this.db
      .select({ id: workforceUsers.id })
      .from(workforceUsers)
      .where(eq(workforceUsers.email, normalized));
    if (existing) {
      await this.db
        .update(workforceUsers)
        .set({ status: "active", updatedAt: now })
        .where(eq(workforceUsers.id, existing.id));
      return existing.id;
    }
    const id = randomUUID();
    await this.db
      .insert(workforceUsers)
      .values({ id, email: normalized, status: "active" });
    return id;
  }

  async grantRole(
    email: string,
    merchantId: string,
    role: WorkforceRole,
  ): Promise<void> {
    const userId = await this.requireUserId(email);
    await this.db
      .insert(merchantMemberships)
      .values({ merchantId, userId, role, status: "active" })
      .onConflictDoUpdate({
        target: [
          merchantMemberships.merchantId,
          merchantMemberships.userId,
          merchantMemberships.role,
        ],
        set: { status: "active", updatedAt: this.clock() },
      });
  }

  async revokeRole(
    email: string,
    merchantId: string,
    role: WorkforceRole,
  ): Promise<void> {
    const userId = await this.requireUserId(email);
    await this.db
      .update(merchantMemberships)
      .set({ status: "revoked", updatedAt: this.clock() })
      .where(
        and(
          eq(merchantMemberships.merchantId, merchantId),
          eq(merchantMemberships.userId, userId),
          eq(merchantMemberships.role, role),
        ),
      );
  }

  /** Disables the user and revokes every open session. */
  async disableUser(email: string): Promise<void> {
    const userId = await this.requireUserId(email);
    const now = this.clock();
    await this.db.transaction(async (tx) => {
      await tx
        .update(workforceUsers)
        .set({ status: "disabled", updatedAt: now })
        .where(eq(workforceUsers.id, userId));
      await tx
        .update(workforceSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(workforceSessions.userId, userId),
            isNull(workforceSessions.revokedAt),
          ),
        );
    });
  }

  async listUsers() {
    const users = await this.db
      .select({
        id: workforceUsers.id,
        email: workforceUsers.email,
        status: workforceUsers.status,
        lastLoginAt: workforceUsers.lastLoginAt,
      })
      .from(workforceUsers)
      .orderBy(workforceUsers.email);
    const memberships = await this.db
      .select()
      .from(merchantMemberships)
      .where(eq(merchantMemberships.status, "active"));
    return users.map((user) => ({
      ...user,
      grants: memberships
        .filter((membership) => membership.userId === user.id)
        .map(({ merchantId, role }) => ({ merchantId, role })),
    }));
  }

  private async requireUserId(email: string): Promise<string> {
    const [user] = await this.db
      .select({ id: workforceUsers.id })
      .from(workforceUsers)
      .where(eq(workforceUsers.email, normalizeEmail(email)));
    if (!user)
      throw new Error(`No workforce user for ${normalizeEmail(email)}`);
    return user.id;
  }
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized))
    throw new Error("A valid email is required");
  return normalized;
}

/** Production resolver: the session cookie maps to a stored, revocable session. */
export class DatabaseWorkforceContextResolver implements WorkforceContextResolver {
  constructor(private readonly directory: WorkforceDirectory) {}

  async resolve(request: Request): Promise<TenantContext> {
    const token = readCookie(request, WORKFORCE_SESSION_COOKIE);
    if (!token)
      throw new WorkforceContextError("WORKFORCE_IDENTITY_REQUIRED", 401);
    const { userId, rolesByMerchant } =
      await this.directory.resolveSession(token);
    const merchantIds = [...rolesByMerchant.keys()];
    if (merchantIds.length === 0)
      throw new WorkforceContextError("WORKFORCE_IDENTITY_DISABLED", 403);
    // The selection cookie only chooses among merchants the user is granted.
    const selected = readCookie(request, WORKFORCE_MERCHANT_COOKIE);
    const merchantId =
      selected && rolesByMerchant.has(selected) ? selected : merchantIds[0]!;
    const requestId = request.headers.get("x-request-id");
    return {
      merchantId,
      merchantIds,
      researcherId: userId,
      roles: rolesByMerchant.get(merchantId)!,
      correlationId:
        requestId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          requestId,
        )
          ? requestId
          : randomUUID(),
    };
  }
}

function readCookie(request: Request, name: string): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.[1];
}
