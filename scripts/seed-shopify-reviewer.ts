import { randomUUID } from "node:crypto";

import { createDatabase } from "@holler/db";

import type { TenantContext } from "../apps/web/app/lib/operations-types";
import {
  PostgresOperationsApplicationService,
  PrefixedSyntheticPhoneDecryptor,
} from "../apps/web/app/lib/postgres-operations-service.server";
import {
  recordShopifyInstall,
  shopifyMerchantId,
} from "../apps/web/app/lib/shopify-ingestion.server";

const shopDomain = process.argv[2]?.trim().toLowerCase();
if (!shopDomain || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)) {
  throw new Error(
    "Usage: HOLLER_REVIEWER_SEED_CONFIRM=synthetic-only npm run shopify:seed-reviewer -- store.myshopify.com",
  );
}
if (process.env.HOLLER_REVIEWER_SEED_CONFIRM !== "synthetic-only") {
  throw new Error(
    "Set HOLLER_REVIEWER_SEED_CONFIRM=synthetic-only to confirm this is a dedicated reviewer/development store.",
  );
}
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const { db, pool } = createDatabase(databaseUrl);
try {
  const merchantId = await recordShopifyInstall(db, shopDomain);
  const service = new PostgresOperationsApplicationService(
    db,
    new PrefixedSyntheticPhoneDecryptor(),
  );
  const base = {
    merchantId,
    merchantIds: [merchantId],
    correlationId: randomUUID(),
  } as const;
  const manager: TenantContext = {
    ...base,
    researcherId: randomUUID(),
    roles: ["platform_admin"],
  };
  const merchant: TenantContext = {
    ...base,
    researcherId: randomUUID(),
    roles: [],
    viewer: "merchant",
  };
  const [field] = await service.listResearchFields(manager);
  if (!field) throw new Error("No published research field is available");

  const common = {
    weeklyTarget: 5,
    cohortExpression: {
      predicate: "customer.order_sequence",
      version: 1,
      config: { operator: "equals", value: 1 },
    },
    fields: [
      { kind: "library" as const, fieldVersionId: field.id, required: true },
    ],
  };

  const sample = await service.saveMoment(manager, {
    ...common,
    name: "[Sample] First-purchase attribution audit",
    objective:
      "Illustrate how observed attribution is compared with customer-reported discovery.",
    publish: true,
  });
  const current = (await service.listMoments(manager)).find(
    (moment) => moment.id === sample.id,
  );
  if (current?.status === "live")
    await service.setMomentStatus(manager, sample.id, "completed");
  await service.setMomentReportUrl(
    manager,
    sample.id,
    "https://withholler.com/sample-report",
  );

  await service.saveMoment(merchant, {
    ...common,
    name: "[Sample] Why do first-time customers choose us?",
    objective:
      "Show how a merchant-submitted question remains visible while Holler reviews it.",
    publish: false,
  });

  console.info(
    JSON.stringify({
      event: "shopify.reviewer_seeded",
      shopDomain,
      merchantId: shopifyMerchantId(shopDomain),
      syntheticOnly: true,
    }),
  );
} finally {
  await pool.end();
}
