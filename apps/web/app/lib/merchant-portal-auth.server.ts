import { randomBytes, randomUUID } from "node:crypto";

import {
  merchantLoginDomains,
  merchantPortalSessions,
  merchants,
  type HollerDatabase,
} from "@holler/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "react-router";

import type { VerifiedGoogleIdentity } from "./google-oidc.server";
import type { TenantContext } from "./operations-types";
import {
  getShopifyIngestionDatabase,
  stableUuid,
} from "./shopify-ingestion.server";
import { hashSessionToken } from "./workforce-directory.server";

export const MERCHANT_PORTAL_PATH = "/portal";
export const MERCHANT_PORTAL_SESSION_COOKIE = "holler_merchant_session";
/** A working week; merchants sign in with Google again after it. */
export const MERCHANT_PORTAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Domains that can never gate a merchant: shared consumer mail providers,
 * where a domain says nothing about who someone works for, and Holler's own
 * staff domain, whose people use the workforce console instead.
 */
const UNASSIGNABLE_DOMAINS = new Set([
  "withholler.com",
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "myshopify.com",
]);

export class MerchantPortalError extends Error {
  constructor(
    readonly code:
      | "PORTAL_DOMAIN_NOT_REGISTERED"
      | "PORTAL_DOMAIN_INVALID"
      | "PORTAL_DOMAIN_TAKEN"
      | "PORTAL_MERCHANT_NOT_FOUND"
      | "PORTAL_SESSION_REQUIRED",
  ) {
    super(code);
    this.name = "MerchantPortalError";
  }
}

export function normalizeLoginDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/^@/, "");
  if (!DOMAIN.test(domain) || UNASSIGNABLE_DOMAINS.has(domain))
    throw new MerchantPortalError("PORTAL_DOMAIN_INVALID");
  return domain;
}

export interface MerchantPortalSession {
  readonly merchantId: string;
  readonly merchantName: string;
  readonly email: string;
  /** Stable, per-person actor ID recorded on audit events. */
  readonly actorId: string;
}

/**
 * Merchant portal access in PostgreSQL. Operators register a merchant's
 * email domain; anyone signed in to that Google Workspace domain then gets
 * the merchant's read-mostly view. Every request re-checks the session and
 * that its domain is still registered to the same merchant, so removing a
 * domain ends access immediately.
 */
export class MerchantPortalDirectory {
  constructor(
    private readonly db: HollerDatabase,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Creates a session for a verified Workspace identity; returns the cookie token. */
  async signIn(identity: VerifiedGoogleIdentity): Promise<string> {
    const [registration] = await this.db
      .select({ merchantId: merchantLoginDomains.merchantId })
      .from(merchantLoginDomains)
      .where(
        and(
          eq(merchantLoginDomains.domain, identity.hostedDomain),
          eq(merchantLoginDomains.status, "active"),
        ),
      );
    if (!registration)
      throw new MerchantPortalError("PORTAL_DOMAIN_NOT_REGISTERED");
    const now = this.clock();
    const token = randomBytes(32).toString("base64url");
    await this.db.insert(merchantPortalSessions).values({
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      merchantId: registration.merchantId,
      domain: identity.hostedDomain,
      oidcIssuer: identity.issuer,
      oidcSubject: identity.subject,
      email: identity.email,
      authenticatedAt: now,
      expiresAt: new Date(now.getTime() + MERCHANT_PORTAL_SESSION_TTL_MS),
    });
    return token;
  }

  async resolveSession(token: string): Promise<MerchantPortalSession> {
    if (!SESSION_TOKEN.test(token))
      throw new MerchantPortalError("PORTAL_SESSION_REQUIRED");
    const [session] = await this.db
      .select({
        merchantId: merchantPortalSessions.merchantId,
        merchantName: merchants.name,
        email: merchantPortalSessions.email,
        issuer: merchantPortalSessions.oidcIssuer,
        subject: merchantPortalSessions.oidcSubject,
      })
      .from(merchantPortalSessions)
      .innerJoin(
        merchantLoginDomains,
        and(
          eq(merchantLoginDomains.domain, merchantPortalSessions.domain),
          eq(
            merchantLoginDomains.merchantId,
            merchantPortalSessions.merchantId,
          ),
          eq(merchantLoginDomains.status, "active"),
        ),
      )
      .innerJoin(merchants, eq(merchants.id, merchantPortalSessions.merchantId))
      .where(
        and(
          eq(merchantPortalSessions.tokenHash, hashSessionToken(token)),
          isNull(merchantPortalSessions.revokedAt),
          gt(merchantPortalSessions.expiresAt, this.clock()),
        ),
      );
    if (!session) throw new MerchantPortalError("PORTAL_SESSION_REQUIRED");
    return {
      merchantId: session.merchantId,
      merchantName: session.merchantName,
      email: session.email,
      actorId: stableUuid(
        `merchant-portal:${session.issuer}:${session.subject}`,
      ),
    };
  }

  async revokeSession(token: string): Promise<void> {
    if (!SESSION_TOKEN.test(token)) return;
    await this.db
      .update(merchantPortalSessions)
      .set({ revokedAt: this.clock() })
      .where(
        and(
          eq(merchantPortalSessions.tokenHash, hashSessionToken(token)),
          isNull(merchantPortalSessions.revokedAt),
        ),
      );
  }

  // Operator administration (scripts/merchant-portal.ts). No UI for the pilot.

  /** Registers (or re-activates) a domain for a merchant. */
  async addDomain(merchantId: string, value: string): Promise<string> {
    const domain = normalizeLoginDomain(value);
    const now = this.clock();
    return this.db.transaction(async (tx) => {
      const [merchant] = await tx
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.id, merchantId));
      if (!merchant) throw new MerchantPortalError("PORTAL_MERCHANT_NOT_FOUND");
      const [existing] = await tx
        .select()
        .from(merchantLoginDomains)
        .where(eq(merchantLoginDomains.domain, domain))
        .for("update");
      // A domain never moves between merchants silently; remove it first.
      if (
        existing &&
        existing.merchantId !== merchantId &&
        existing.status === "active"
      )
        throw new MerchantPortalError("PORTAL_DOMAIN_TAKEN");
      await tx
        .insert(merchantLoginDomains)
        .values({ domain, merchantId, status: "active" })
        .onConflictDoUpdate({
          target: merchantLoginDomains.domain,
          set: { merchantId, status: "active", updatedAt: now },
        });
      return domain;
    });
  }

  /** Removes a domain and ends every session it admitted. */
  async removeDomain(value: string): Promise<void> {
    const domain = normalizeLoginDomain(value);
    const now = this.clock();
    await this.db.transaction(async (tx) => {
      await tx
        .update(merchantLoginDomains)
        .set({ status: "removed", updatedAt: now })
        .where(eq(merchantLoginDomains.domain, domain));
      await tx
        .update(merchantPortalSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(merchantPortalSessions.domain, domain),
            isNull(merchantPortalSessions.revokedAt),
          ),
        );
    });
  }

  async listDomains() {
    return this.db
      .select({
        domain: merchantLoginDomains.domain,
        merchantId: merchantLoginDomains.merchantId,
        merchantName: merchants.name,
        status: merchantLoginDomains.status,
      })
      .from(merchantLoginDomains)
      .innerJoin(merchants, eq(merchants.id, merchantLoginDomains.merchantId))
      .orderBy(merchants.name, merchantLoginDomains.domain);
  }
}

let directory: MerchantPortalDirectory | undefined;
export function getMerchantPortalDirectory(): MerchantPortalDirectory {
  directory ??= new MerchantPortalDirectory(getShopifyIngestionDatabase());
  return directory;
}

export function readMerchantPortalToken(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === MERCHANT_PORTAL_SESSION_COOKIE)?.[1];
}

/**
 * Builds the merchant viewer's context from a portal session: the same
 * read-mostly, no-role view the Shopify app gives. Page requests without a
 * session go to the portal sign-in; data requests get a 401.
 */
export async function authenticatePortalMerchant(
  request: Request,
  directoryOverride?: MerchantPortalDirectory,
): Promise<{ context: TenantContext; session: MerchantPortalSession }> {
  const token = readMerchantPortalToken(request);
  let session: MerchantPortalSession;
  try {
    if (!token) throw new MerchantPortalError("PORTAL_SESSION_REQUIRED");
    session = await (
      directoryOverride ?? getMerchantPortalDirectory()
    ).resolveSession(token);
  } catch (error) {
    if (!(error instanceof MerchantPortalError)) throw error;
    const url = new URL(request.url);
    // React Router follows redirects on navigations and form posts; only the
    // recording player's plain fetch needs a status it can read.
    if (!url.pathname.endsWith("/recording"))
      throw redirect(
        `${MERCHANT_PORTAL_PATH}/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`,
      );
    throw Response.json(
      { error: { code: "PORTAL_SESSION_REQUIRED" } },
      { status: 401 },
    );
  }
  return {
    session,
    context: {
      merchantId: session.merchantId,
      merchantIds: [session.merchantId],
      researcherId: session.actorId,
      correlationId: randomUUID(),
      roles: [],
      viewer: "merchant",
    },
  };
}

/** Only paths inside the portal; anything else lands on its home page. */
export function safePortalRedirectPath(value: unknown): string {
  return typeof value === "string" &&
    (value === MERCHANT_PORTAL_PATH ||
      value.startsWith(`${MERCHANT_PORTAL_PATH}/`) ||
      value.startsWith(`${MERCHANT_PORTAL_PATH}?`)) &&
    !value.startsWith(`${MERCHANT_PORTAL_PATH}/login`) &&
    !value.includes("\\")
    ? value
    : MERCHANT_PORTAL_PATH;
}

function isSecureRequest(request: Request): boolean {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

export function merchantPortalSessionCookie(
  request: Request,
  token: string,
): string {
  return [
    `${MERCHANT_PORTAL_SESSION_COOKIE}=${token}`,
    `Path=${MERCHANT_PORTAL_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MERCHANT_PORTAL_SESSION_TTL_MS / 1000}`,
    ...(isSecureRequest(request) ? ["Secure"] : []),
  ].join("; ");
}

export function clearMerchantPortalSessionCookie(request: Request): string {
  return [
    `${MERCHANT_PORTAL_SESSION_COOKIE}=`,
    `Path=${MERCHANT_PORTAL_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(isSecureRequest(request) ? ["Secure"] : []),
  ].join("; ");
}
