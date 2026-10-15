import { z } from "zod";

import {
  shopifyOrderIngressV1Schema,
  type ShopifyOrderIngressV1,
} from "./ingress";

/** Only city and state/province are read from any address. */
const webhookAddressSchema = z
  .object({
    city: z.string().nullable().optional(),
    province_code: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

/**
 * The subset of Shopify's REST-shaped `orders/create` / `orders/updated`
 * webhook body Holler reads. Unknown keys (email, street addresses, notes,
 * ...) are stripped by zod and never reach the ingress envelope.
 */
const webhookOrderSchema = z.object({
  admin_graphql_api_id: z.string(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  cancelled_at: z.string().nullable().optional(),
  test: z.boolean().optional(),
  financial_status: z.string().nullable().optional(),
  fulfillment_status: z.string().nullable().optional(),
  currency: z.string(),
  total_price: z.string(),
  landing_site: z.string().nullable().optional(),
  referring_site: z.string().nullable().optional(),
  customer: z
    .object({
      admin_graphql_api_id: z.string(),
      phone: z.string().nullable().optional(),
      first_name: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
      default_address: webhookAddressSchema,
    })
    .nullable()
    .optional(),
  shipping_address: webhookAddressSchema,
  billing_address: webhookAddressSchema,
  refunds: z
    .array(
      z.object({
        refund_line_items: z
          .array(
            z.object({
              line_item_id: z.number().int(),
              quantity: z.number().int().nonnegative(),
            }),
          )
          .optional(),
      }),
    )
    .nullable()
    .optional(),
  line_items: z.array(
    z.object({
      admin_graphql_api_id: z.string(),
      product_id: z.number().int().nullable().optional(),
      variant_id: z.number().int().nullable().optional(),
      sku: z.string().nullable().optional(),
      title: z.string(),
      variant_title: z.string().nullable().optional(),
      quantity: z.number().int(),
      price: z.string(),
      total_discount: z.string().nullable().optional(),
      discount_allocations: z
        .array(z.object({ amount: z.string() }))
        .nullable()
        .optional(),
    }),
  ),
});

export interface ShopifyOrderWebhookInput {
  readonly webhookId: string;
  readonly eventId: string | null;
  readonly shopDomain: string;
  readonly apiVersion: string;
  readonly triggeredAt: string;
  readonly payload: unknown;
}

const iso = (value: string) => new Date(value).toISOString();

const blankToNull = (value: string | null | undefined, maximum: number) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maximum) : null;
};

const gid = (type: string, id: number | null | undefined) =>
  id ? `gid://shopify/${type}/${id}` : null;

type WebhookOrder = z.infer<typeof webhookOrderSchema>;
type WebhookLine = WebhookOrder["line_items"][number];

/** "Portland, OR" from the first address that has a city. */
function locality(order: WebhookOrder): string | null {
  for (const address of [
    order.shipping_address,
    order.billing_address,
    order.customer?.default_address,
  ]) {
    const city = blankToNull(address?.city, 80);
    if (!city) continue;
    const region = blankToNull(address?.province_code, 8);
    return region ? `${city}, ${region}` : city;
  }
  return null;
}

/** Sum of discount allocations, falling back to Shopify's total_discount. */
function lineDiscount(line: WebhookLine): string {
  // Integer micro-units avoid float drift when summing allocations.
  const toMicros = (amount: string) => Math.round(Number(amount) * 1_000_000);
  const allocations = line.discount_allocations ?? [];
  const total = allocations.length
    ? allocations.reduce((sum, item) => sum + toMicros(item.amount), 0)
    : toMicros(line.total_discount ?? "0");
  if (!Number.isFinite(total) || total <= 0) return "0";
  return (total / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
}

function refundedQuantities(order: WebhookOrder): Map<number, number> {
  const refunded = new Map<number, number>();
  for (const refund of order.refunds ?? [])
    for (const item of refund.refund_line_items ?? [])
      refunded.set(
        item.line_item_id,
        (refunded.get(item.line_item_id) ?? 0) + item.quantity,
      );
  return refunded;
}

const legacyLineId = (gidValue: string) =>
  Number(/\/(\d+)$/.exec(gidValue)?.[1] ?? 0);

function parseUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value, "https://landing.invalid");
  } catch {
    return null;
  }
}

function observedAttribution(
  order: WebhookOrder,
): ShopifyOrderIngressV1["order"]["observedAttribution"] {
  const landing = parseUrl(order.landing_site);
  const referrer = order.referring_site ? parseUrl(order.referring_site) : null;
  const param = (name: string) =>
    blankToNull(landing?.searchParams.get(`utm_${name}`), 200);
  const utm = {
    source: param("source"),
    medium: param("medium"),
    campaign: param("campaign"),
    content: param("content"),
    term: param("term"),
  };
  const hasUtm = Object.values(utm).some((value) => value !== null);
  const referringDomain =
    referrer && referrer.hostname !== "landing.invalid"
      ? referrer.hostname.slice(0, 253)
      : null;
  const landingPath = landing ? landing.pathname.slice(0, 2048) : null;
  return {
    schemaVersion: 1,
    readiness:
      hasUtm || referringDomain || landingPath ? "ready" : "unavailable",
    source: utm.source?.slice(0, 120) ?? null,
    channel: utm.medium?.slice(0, 120) ?? null,
    campaign: utm.campaign,
    referringDomain,
    landingPath,
    utm: hasUtm ? utm : null,
    observedAt: iso(order.created_at),
  };
}

/**
 * Maps a verified Shopify `orders/create` delivery into the allowlisted
 * ingress envelope. Throws a ZodError when the payload cannot be trusted as an
 * order; callers must never log the payload itself.
 */
export function mapShopifyOrderWebhook(
  input: ShopifyOrderWebhookInput,
): ShopifyOrderIngressV1 {
  const order = webhookOrderSchema.parse(input.payload);
  const refunded = refundedQuantities(order);
  return shopifyOrderIngressV1Schema.parse({
    schemaVersion: 1,
    webhookId: input.webhookId,
    eventId: input.eventId,
    shopDomain: input.shopDomain,
    apiVersion: input.apiVersion,
    triggeredAt: iso(input.triggeredAt),
    order: {
      id: order.admin_graphql_api_id,
      name: order.name.trim().slice(0, 64),
      createdAt: iso(order.created_at),
      updatedAt: iso(order.updated_at),
      cancelledAt: order.cancelled_at ? iso(order.cancelled_at) : null,
      test: order.test ?? false,
      financialStatus: blankToNull(order.financial_status, 80),
      fulfillmentStatus: blankToNull(order.fulfillment_status, 80),
      total: { amount: order.total_price, currency: order.currency },
      customer: order.customer
        ? {
            id: order.customer.admin_graphql_api_id,
            phone: blankToNull(order.customer.phone, 32),
            firstName: blankToNull(order.customer.first_name, 120),
            locality: locality(order),
            createdAt: order.customer.created_at
              ? iso(order.customer.created_at)
              : null,
          }
        : null,
      lineItems: order.line_items.map((line) => ({
        id: line.admin_graphql_api_id,
        productId: gid("Product", line.product_id),
        variantId: gid("ProductVariant", line.variant_id),
        sku: blankToNull(line.sku, 255),
        title: line.title.trim().slice(0, 500) || "Untitled item",
        variantTitle: blankToNull(line.variant_title, 255),
        quantity: line.quantity,
        unitPrice: { amount: line.price, currency: order.currency },
        discount: { amount: lineDiscount(line), currency: order.currency },
        refundedQuantity: Math.min(
          line.quantity,
          refunded.get(legacyLineId(line.admin_graphql_api_id)) ?? 0,
        ),
      })),
      observedAttribution: observedAttribution(order),
    },
  });
}

/** Converts a Shopify decimal string to integer minor units for the currency. */
export function moneyToMinor(amount: string, currency: string): number {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const [whole = "0", fraction = ""] = amount.split(".");
  const padded = fraction.padEnd(digits, "0");
  if (padded.slice(digits).replace(/0/g, ""))
    throw new Error("Money amount exceeds currency precision");
  return Number(whole) * 10 ** digits + Number(padded.slice(0, digits) || 0);
}

/**
 * The numeric ID merchants see in Shopify admin URLs and exports
 * (`gid://shopify/Customer/12345` -> `12345`).
 */
export function shopifyLegacyId(gid: string): string {
  const match = /^gid:\/\/shopify\/[A-Za-z]+\/([1-9][0-9]*)$/.exec(gid);
  if (!match) throw new Error("Expected a Shopify GID");
  return match[1]!;
}
