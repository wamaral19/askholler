import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { HollerDatabase } from "./repositories";
import { deletionRequests } from "./schema";

/** Shopify requires redaction within 30 days of the request. */
export const DELETION_DUE_MS = 30 * 24 * 60 * 60 * 1000;

export type PrivacySubject =
  | { readonly scope: "customer"; readonly customerId: string }
  | { readonly scope: "shop" };

export function subjectRefHash(merchantId: string, subject: PrivacySubject) {
  return createHash("sha256")
    .update(
      subject.scope === "customer"
        ? `customer:${merchantId}:${subject.customerId}`
        : `shop:${merchantId}`,
    )
    .digest("hex");
}

/**
 * Records a deletion request idempotently; the sweep executes it. Shopify
 * redaction webhooks retry, so a repeat delivery returns the same request.
 */
export async function requestDeletion(
  db: HollerDatabase,
  merchantId: string,
  subject: PrivacySubject,
  now: Date,
): Promise<string> {
  const refHash = subjectRefHash(merchantId, subject);
  await db
    .insert(deletionRequests)
    .values({
      id: randomUUID(),
      merchantId,
      scope: subject.scope,
      subjectRefHash: refHash,
      subjectId: subject.scope === "customer" ? subject.customerId : null,
      status: "pending",
      dueAt: new Date(now.getTime() + DELETION_DUE_MS),
    })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: deletionRequests.id })
    .from(deletionRequests)
    .where(
      and(
        eq(deletionRequests.merchantId, merchantId),
        eq(deletionRequests.scope, subject.scope),
        eq(deletionRequests.subjectRefHash, refHash),
      ),
    );
  return row!.id;
}
