import { randomUUID } from "node:crypto";

import { merchantCharges, type HollerDatabase } from "@holler/db";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import {
  BILLING_CURRENCY,
  BillingError,
  MAX_AMOUNT_MINOR,
  MAX_DESCRIPTION,
  nextChargeState,
  type ChargeKind,
  type ChargeStatus,
  type MerchantCharge,
} from "./merchant-charges";

function toCharge(row: typeof merchantCharges.$inferSelect): MerchantCharge {
  return {
    id: row.id,
    kind: row.kind as ChargeKind,
    description: row.description,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status as ChargeStatus,
    shopifyChargeId: row.shopifyChargeId,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

export async function listMerchantCharges(
  db: HollerDatabase,
  merchantId: string,
): Promise<MerchantCharge[]> {
  const rows = await db
    .select()
    .from(merchantCharges)
    .where(eq(merchantCharges.merchantId, merchantId))
    .orderBy(desc(merchantCharges.createdAt));
  return rows.map(toCharge);
}

export async function getMerchantCharge(
  db: HollerDatabase,
  merchantId: string,
  chargeId: string,
): Promise<MerchantCharge> {
  const [row] = await db
    .select()
    .from(merchantCharges)
    .where(
      and(
        eq(merchantCharges.id, chargeId),
        eq(merchantCharges.merchantId, merchantId),
      ),
    )
    .limit(1);
  if (!row) throw new BillingError("CHARGE_NOT_FOUND", 404);
  return toCharge(row);
}

export async function createMerchantCharge(
  db: HollerDatabase,
  input: {
    readonly merchantId: string;
    readonly kind: ChargeKind;
    readonly description: string;
    readonly amountMinor: number;
    readonly createdBy: string;
  },
  now = new Date(),
): Promise<MerchantCharge> {
  const description = input.description.trim();
  if (
    (input.kind !== "one_time" && input.kind !== "monthly") ||
    !description ||
    description.length > MAX_DESCRIPTION ||
    !Number.isInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    input.amountMinor > MAX_AMOUNT_MINOR
  )
    throw new BillingError("INVALID_CHARGE", 400);
  const [row] = await db
    .insert(merchantCharges)
    .values({
      id: randomUUID(),
      merchantId: input.merchantId,
      kind: input.kind,
      description,
      amountMinor: input.amountMinor,
      currency: BILLING_CURRENCY,
      status: "pending",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toCharge(row!);
}

/** Staff withdraw a charge the merchant has not approved yet. */
export async function withdrawMerchantCharge(
  db: HollerDatabase,
  merchantId: string,
  chargeId: string,
  now = new Date(),
): Promise<void> {
  const updated = await db
    .update(merchantCharges)
    .set({ status: "cancelled", decidedAt: now, updatedAt: now })
    .where(
      and(
        eq(merchantCharges.id, chargeId),
        eq(merchantCharges.merchantId, merchantId),
        eq(merchantCharges.status, "pending"),
      ),
    )
    .returning({ id: merchantCharges.id });
  if (!updated.length) throw new BillingError("CHARGE_NOT_PENDING", 409);
}

/** Links a pending charge to the Shopify charge the merchant is approving. */
export async function recordShopifyCharge(
  db: HollerDatabase,
  merchantId: string,
  chargeId: string,
  shopifyChargeId: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(merchantCharges)
    .set({ shopifyChargeId, updatedAt: now })
    .where(
      and(
        eq(merchantCharges.id, chargeId),
        eq(merchantCharges.merchantId, merchantId),
        eq(merchantCharges.status, "pending"),
      ),
    );
}

/**
 * Applies a status Shopify reported (webhook or query) to the matching
 * charge. Unknown charge IDs are ignored: they belong to an earlier install
 * or were never Holler's.
 */
export async function applyShopifyChargeStatus(
  db: HollerDatabase,
  merchantId: string,
  shopifyChargeId: string,
  shopifyStatus: string,
  now = new Date(),
): Promise<void> {
  const [row] = await db
    .select()
    .from(merchantCharges)
    .where(
      and(
        eq(merchantCharges.merchantId, merchantId),
        eq(merchantCharges.shopifyChargeId, shopifyChargeId),
      ),
    )
    .limit(1);
  if (!row) return;
  const next = nextChargeState(row.kind as ChargeKind, shopifyStatus);
  if (!next || (next.status === row.status && next.relink === false)) return;
  await db
    .update(merchantCharges)
    .set({
      status: next.status,
      ...(next.relink ? { shopifyChargeId: null } : {}),
      decidedAt: next.status === "pending" ? null : now,
      updatedAt: now,
    })
    .where(eq(merchantCharges.id, row.id));
}

/**
 * Shopify cancels an app's subscriptions on uninstall and approval pages stop
 * working, so after a reinstall every unpaid or recurring charge asks for
 * approval again.
 */
export async function resetChargesOnUninstall(
  db: HollerDatabase,
  merchantId: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(merchantCharges)
    .set({
      status: "pending",
      shopifyChargeId: null,
      decidedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(merchantCharges.merchantId, merchantId),
        inArray(merchantCharges.status, ["pending", "active"]),
        isNotNull(merchantCharges.shopifyChargeId),
      ),
    );
}
