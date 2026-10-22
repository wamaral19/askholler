/**
 * Shared by the billing pages and the server: what a charge is and how it
 * reads. Persistence lives in merchant-billing.server.ts.
 */
/**
 * Custom bills staff raise for a merchant. Every charge is approved by the
 * merchant and collected through Shopify Billing; this table is Holler's
 * record of what was asked for and where Shopify says it stands.
 */
export type ChargeKind = "one_time" | "monthly";
export type ChargeStatus =
  "pending" | "active" | "paid" | "declined" | "cancelled";

export interface MerchantCharge {
  readonly id: string;
  readonly kind: ChargeKind;
  readonly description: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: ChargeStatus;
  /** Set once the merchant opened Shopify's approval page for it. */
  readonly shopifyChargeId: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

export class BillingError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "BillingError";
  }
}

/** Shopify app charges are billed in US dollars. */
export const BILLING_CURRENCY = "USD";
export const MAX_AMOUNT_MINOR = 10_000_000;
export const MAX_DESCRIPTION = 100;

export const chargeKindLabels: Readonly<Record<ChargeKind, string>> = {
  one_time: "Project",
  monthly: "Monthly",
};

export const chargeStatusLabels: Readonly<Record<ChargeStatus, string>> = {
  pending: "Awaiting approval",
  active: "Active",
  paid: "Paid",
  declined: "Declined",
  cancelled: "Cancelled",
};

export function formatChargeAmount(
  charge: Pick<MerchantCharge, "amountMinor" | "currency" | "kind">,
): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: charge.currency,
  }).format(charge.amountMinor / 100);
  return charge.kind === "monthly" ? `${amount} / month` : amount;
}

/** "1,250.50" or "1250" → 125050; null when not a positive dollar amount. */
export function parseDollarAmount(value: string): number | null {
  const cleaned = value.replaceAll(",", "").replace(/^\$/, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const minor = Math.round(Number(cleaned) * 100);
  return minor > 0 && minor <= MAX_AMOUNT_MINOR ? minor : null;
}

/**
 * Shopify statuses → Holler's. An expired approval page returns the charge
 * to pending so the merchant can open a fresh one; pending and frozen leave
 * the record as it is.
 */
export function nextChargeState(
  kind: ChargeKind,
  shopifyStatus: string,
): { status: ChargeStatus; relink: boolean } | null {
  switch (shopifyStatus.toUpperCase()) {
    case "ACTIVE":
    case "ACCEPTED":
      return { status: kind === "monthly" ? "active" : "paid", relink: false };
    case "DECLINED":
      return { status: "declined", relink: false };
    case "CANCELLED":
      return { status: "cancelled", relink: false };
    case "EXPIRED":
      return { status: "pending", relink: true };
    default:
      return null;
  }
}

/** Charges whose Shopify status may still change, for reconciliation. */
export function chargesToReconcile(
  charges: readonly MerchantCharge[],
): MerchantCharge[] {
  return charges.filter(
    (charge) =>
      charge.shopifyChargeId !== null &&
      (charge.status === "pending" || charge.status === "active"),
  );
}
