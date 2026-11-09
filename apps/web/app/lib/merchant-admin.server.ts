import { randomUUID } from "node:crypto";

import {
  auditEvents,
  merchantLoginDomains,
  merchantMemberships,
  merchants,
  type HollerDatabase,
} from "@holler/db";
import type { WorkforceRole } from "@holler/domain";
import { and, eq, inArray } from "drizzle-orm";

import {
  provisionDefaultScript,
  shopifyMerchantId,
} from "./shopify-ingestion.server";

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export class MerchantAdminError extends Error {
  constructor(
    readonly code:
      | "MERCHANT_NAME_INVALID"
      | "MERCHANT_SHOP_DOMAIN_INVALID"
      | "MERCHANT_TIMEZONE_INVALID"
      | "MERCHANT_EXISTS",
  ) {
    super(code);
    this.name = "MerchantAdminError";
  }
}

export interface NewMerchant {
  readonly name: string;
  /** The store's .myshopify.com address; store webhooks find the merchant by it. */
  readonly shopDomain: string;
  readonly timezone: string;
}

/** Accepts "acme", "acme.myshopify.com", or an admin URL for the store. */
export function normalizeShopDomain(value: string): string {
  let domain = value.trim().toLowerCase();
  const adminStore = /admin\.shopify\.com\/store\/([a-z0-9-]+)/.exec(domain);
  if (adminStore) domain = adminStore[1]!;
  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  if (!SHOP_DOMAIN.test(domain))
    throw new MerchantAdminError("MERCHANT_SHOP_DOMAIN_INVALID");
  return domain;
}

export function isTimezone(value: string): boolean {
  return Intl.supportedValuesOf("timeZone").includes(value) || value === "UTC";
}

/**
 * Creates a merchant ready for store webhooks. The ID derives from the shop
 * domain, exactly as an install or a first webhook would, so they all land on
 * this merchant. `installedAt` stays empty until the first verified order
 * arrives, because history completeness starts there. The creator gets their
 * current roles on the new merchant so they can switch to it right away.
 */
export async function createMerchant(
  db: HollerDatabase,
  input: NewMerchant,
  creator: {
    readonly actorId: string;
    /** Null when the actor is not a stored workforce user (synthetic sign-in). */
    readonly workforceUserId: string | null;
    readonly roles: readonly WorkforceRole[];
  },
  now = new Date(),
): Promise<string> {
  const name = input.name.trim();
  if (!name || name.length > 100)
    throw new MerchantAdminError("MERCHANT_NAME_INVALID");
  const shopDomain = normalizeShopDomain(input.shopDomain);
  if (!isTimezone(input.timezone))
    throw new MerchantAdminError("MERCHANT_TIMEZONE_INVALID");
  const merchantId = shopifyMerchantId(shopDomain);
  await db.transaction(async (tx) => {
    const created = await tx
      .insert(merchants)
      .values({
        id: merchantId,
        shopDomain,
        name,
        timezone: input.timezone,
        status: "active",
      })
      .onConflictDoNothing()
      .returning({ id: merchants.id });
    if (!created.length) throw new MerchantAdminError("MERCHANT_EXISTS");
    await provisionDefaultScript(tx, merchantId, now);
    if (creator.workforceUserId && creator.roles.length)
      await tx
        .insert(merchantMemberships)
        .values(
          creator.roles.map((role) => ({
            merchantId,
            userId: creator.workforceUserId!,
            role,
            status: "active",
          })),
        )
        .onConflictDoNothing();
    await tx.insert(auditEvents).values({
      id: randomUUID(),
      merchantId,
      actorId: creator.actorId,
      action: "merchant.created",
      subjectType: "merchant",
      subjectId: merchantId,
      metadata: { shopDomain },
      occurredAt: now,
    });
  });
  return merchantId;
}

/** The merchants this staff member can work on, with their portal domains. */
export async function listManagedMerchants(
  db: HollerDatabase,
  merchantIds: readonly string[],
) {
  if (!merchantIds.length) return [];
  const rows = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      shopDomain: merchants.shopDomain,
      timezone: merchants.timezone,
      status: merchants.status,
      installedAt: merchants.installedAt,
      createdAt: merchants.createdAt,
    })
    .from(merchants)
    .where(inArray(merchants.id, [...merchantIds]))
    .orderBy(merchants.name);
  const domains = await db
    .select({
      merchantId: merchantLoginDomains.merchantId,
      domain: merchantLoginDomains.domain,
    })
    .from(merchantLoginDomains)
    .where(
      and(
        inArray(merchantLoginDomains.merchantId, [...merchantIds]),
        eq(merchantLoginDomains.status, "active"),
      ),
    )
    .orderBy(merchantLoginDomains.domain);
  return rows.map((row) => ({
    ...row,
    loginDomains: domains
      .filter((domain) => domain.merchantId === row.id)
      .map((domain) => domain.domain),
  }));
}
