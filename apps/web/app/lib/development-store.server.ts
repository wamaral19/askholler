import { randomUUID } from "node:crypto";

import type {
  OperationsApplicationService,
  SaveMomentInput,
  TenantContext,
} from "./operations-types";
import type { HollerDatabase } from "@holler/db";

import {
  createMerchantCharge,
  listMerchantCharges,
} from "./merchant-billing.server";
import type { AdminGraphqlClient } from "./shopify-billing.server";
import { stableUuid } from "./shopify-ingestion.server";

/**
 * True for Shopify Partner development stores, which include the stores App
 * Store reviewers test on. They hold no real customers.
 */
export async function isDevelopmentStore(
  admin: AdminGraphqlClient,
): Promise<boolean> {
  const response = await admin.graphql(
    `#graphql
    query HollerShopPlan { shop { plan { partnerDevelopment } } }`,
  );
  const body = (await response.json()) as {
    data?: { shop: { plan: { partnerDevelopment: boolean } } };
  };
  if (!body.data) throw new Error("Shopify shop plan query failed");
  return body.data.shop.plan.partnerDevelopment;
}

/** Staff-level context for Holler's own automated actions on a merchant. */
export function hollerSystemContext(merchantId: string): TenantContext {
  return {
    merchantId,
    merchantIds: [merchantId],
    researcherId: stableUuid("holler-system"),
    correlationId: randomUUID(),
    roles: ["platform_admin"],
  };
}

export const SAMPLE_RUN_NAME = "[Sample] First-purchase attribution audit";
const SAMPLE_REPORT_URL = "https://withholler.com/sample-report";

/**
 * Adds one clearly labeled, completed sample run linked to the public
 * synthetic sample report, so a development store sees what a finished run
 * looks like. It carries no customer, order, phone, or recording data.
 * Idempotent: the run's ID derives from its content.
 */
export async function seedSampleRun(
  service: OperationsApplicationService,
  merchantId: string,
): Promise<void> {
  const system = hollerSystemContext(merchantId);
  const [field] = await service.listResearchFields(system);
  if (!field) throw new Error("No published research field is available");
  const sample = await service.saveMoment(system, {
    name: SAMPLE_RUN_NAME,
    objective:
      "Illustrate how observed attribution is compared with customer-reported discovery.",
    weeklyTarget: 5,
    cohortExpression: {
      predicate: "customer.order_sequence",
      version: 1,
      config: { operator: "equals", value: 1 },
    },
    fields: [{ kind: "library", fieldVersionId: field.id, required: true }],
    publish: true,
  });
  const current = (await service.listMoments(system)).find(
    (moment) => moment.id === sample.id,
  );
  if (current?.status === "live")
    await service.setMomentStatus(system, sample.id, "completed");
  await service.setMomentReportUrl(system, sample.id, SAMPLE_REPORT_URL);
}

export const SAMPLE_CHARGE_DESCRIPTION =
  "[Sample] Research run (test charge, never billed)";

/**
 * Adds a $1 project charge for a development store that has none, so the
 * Billing page can be exercised end to end. Development stores only accept
 * Shopify test charges, so approving it bills nothing.
 */
export async function seedSampleCharge(
  db: HollerDatabase,
  merchantId: string,
): Promise<void> {
  if ((await listMerchantCharges(db, merchantId)).length) return;
  await createMerchantCharge(db, {
    merchantId,
    kind: "one_time",
    description: SAMPLE_CHARGE_DESCRIPTION,
    amountMinor: 100,
    createdBy: hollerSystemContext(merchantId).researcherId,
  });
}

/**
 * Runs `launch` when `admin` belongs to a development store. Without Shopify
 * admin (the merchant portal), or if the check or launch fails, the request
 * stays a draft for staff and this returns false.
 */
export async function launchIfDevelopmentStore(
  admin: AdminGraphqlClient | undefined,
  launch: () => Promise<void>,
): Promise<boolean> {
  if (!admin) return false;
  try {
    if (!(await isDevelopmentStore(admin))) return false;
    await launch();
    return true;
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "research_request.auto_launch_failed",
        error: error instanceof Error ? error.message : typeof error,
      }),
    );
    return false;
  }
}

/**
 * Launches a merchant's just-sent request on a development store, so the
 * merchant (typically an App Store reviewer) sees it move to Active research
 * instead of waiting on staff. Launching only makes the research eligible
 * for researchers' queue; nothing dials on its own.
 */
export async function launchDevelopmentStoreRequest(
  service: OperationsApplicationService,
  merchantId: string,
  momentId: string,
  input: Omit<SaveMomentInput, "momentId" | "publish">,
): Promise<void> {
  await service.saveMoment(hollerSystemContext(merchantId), {
    ...input,
    momentId,
    publish: true,
  });
}
