import { createHash } from "node:crypto";
import { z } from "zod";

export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const observedAttributionV1Schema = z.object({
  schemaVersion: z.literal(1),
  readiness: z.enum(["ready", "pending", "unavailable", "unknown"]),
  source: z.string().max(120).nullable(),
  channel: z.string().max(120).nullable(),
  campaign: z.string().max(200).nullable(),
  referringDomain: z.string().max(253).nullable(),
  landingPath: z.string().max(2048).nullable(),
  utm: z
    .object({
      source: z.string().max(200).nullable(),
      medium: z.string().max(200).nullable(),
      campaign: z.string().max(200).nullable(),
      content: z.string().max(200).nullable(),
      term: z.string().max(200).nullable(),
    })
    .nullable(),
  observedAt: z.string().datetime(),
});

export const historyCompletenessSchema = z.object({
  state: z.enum(["complete", "partial", "unknown"]),
  historyStartAt: z.string().datetime().nullable(),
  reason: z.enum([
    "full_import",
    "shopify_60_day_window",
    "import_pending",
    "guest_customer",
    "unknown",
  ]),
});

export const catalogEnrichmentSchema = z.object({
  state: z.enum(["pending", "ready", "unavailable"]),
  refreshedAt: z.string().datetime().nullable(),
});

export const commerceEventV1Schema = z.object({
  schemaVersion: z.literal(1),
  merchantId: z.string().uuid(),
  source: z.enum(["synthetic", "shopify_webhook", "shopify_reconcile"]),
  sourceEventId: z.string().min(1).max(255),
  eventType: z.literal("order_completed"),
  customerId: z.string().uuid().nullable(),
  orderId: z.string().uuid(),
  customerOrderSequence: z.number().int().positive().nullable(),
  occurredAt: z.string().datetime(),
  historyCompleteness: historyCompletenessSchema,
  catalogEnrichment: catalogEnrichmentSchema,
  observedAttribution: observedAttributionV1Schema,
});

export type Money = z.infer<typeof moneySchema>;
export type ObservedAttributionV1 = z.infer<typeof observedAttributionV1Schema>;
export type CommerceEventV1 = z.infer<typeof commerceEventV1Schema>;

export function commerceEventIdentity(
  input: Pick<CommerceEventV1, "merchantId" | "source" | "sourceEventId">,
): string {
  return createHash("sha256")
    .update(
      `${input.merchantId}\u0000${input.source}\u0000${input.sourceEventId}`,
    )
    .digest("hex");
}
