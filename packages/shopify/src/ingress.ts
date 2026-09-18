import { observedAttributionV1Schema } from "@holler/domain";
import { z } from "zod";

const shopifyGidSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^gid:\/\/shopify\/[A-Za-z]+\/[1-9][0-9]*$/);

const nullableTrimmedString = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable();

const shopifyMoneySchema = z
  .object({
    amount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();

const shopifyCustomerIngressSchema = z
  .object({
    id: shopifyGidSchema,
    phone: nullableTrimmedString(32),
    firstName: nullableTrimmedString(120),
  })
  .strict();

const shopifyLineItemIngressSchema = z
  .object({
    id: shopifyGidSchema,
    productId: shopifyGidSchema.nullable(),
    variantId: shopifyGidSchema.nullable(),
    sku: nullableTrimmedString(255),
    title: z.string().trim().min(1).max(500),
    quantity: z.number().int().positive(),
    unitPrice: shopifyMoneySchema,
  })
  .strict();

const shopifyOrderIngressPayloadSchema = z
  .object({
    id: shopifyGidSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    cancelledAt: z.string().datetime().nullable(),
    test: z.boolean(),
    financialStatus: nullableTrimmedString(80),
    fulfillmentStatus: nullableTrimmedString(80),
    total: shopifyMoneySchema,
    customer: shopifyCustomerIngressSchema.nullable(),
    lineItems: z.array(shopifyLineItemIngressSchema).min(1).max(500),
    observedAttribution: observedAttributionV1Schema,
  })
  .strict();

/**
 * The allowlisted, post-HMAC ingress envelope. It is intentionally not the raw
 * Shopify webhook payload and rejects common unnecessary PII fields such as
 * email, addresses, and order notes.
 */
export const shopifyOrderIngressV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    webhookId: z.string().uuid(),
    eventId: z.string().uuid().nullable(),
    shopDomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
    apiVersion: z.string().regex(/^20[0-9]{2}-(01|04|07|10)$/),
    triggeredAt: z.string().datetime(),
    order: shopifyOrderIngressPayloadSchema,
  })
  .strict();

export type ShopifyOrderIngressV1 = z.infer<typeof shopifyOrderIngressV1Schema>;
