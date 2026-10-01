import { z } from "zod";

import {
  shopifyOrderIngressV1Schema,
  type ShopifyOrderIngressV1,
} from "./ingress";

/**
 * The subset of Shopify's REST-shaped `orders/create` webhook body Holler
 * reads. Unknown keys (email, addresses, notes, ...) are stripped by zod and
 * never reach the ingress envelope.
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
    })
    .nullable()
    .optional(),
  line_items: z.array(
    z.object({
      admin_graphql_api_id: z.string(),
      product_id: z.number().int().nullable().optional(),
      variant_id: z.number().int().nullable().optional(),
      sku: z.string().nullable().optional(),
      title: z.string(),
      quantity: z.number().int(),
      price: z.string(),
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

function parseUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value, "https://landing.invalid");
  } catch {
    return null;
  }
}

function observedAttribution(
  order: z.infer<typeof webhookOrderSchema>,
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
        quantity: line.quantity,
        unitPrice: { amount: line.price, currency: order.currency },
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
