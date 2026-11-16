import type { HollerDatabase } from "@holler/db";

import {
  isDevelopmentStore,
  seedSampleCharge,
  seedSampleRun,
} from "./development-store.server";
import { sendOpsAlert, staffUrl } from "./ops-alerts.server";
import type { OperationsApplicationService } from "./operations-types";
import type { AdminGraphqlClient } from "./shopify-billing.server";
import {
  hasActiveShopifyInstall,
  recordShopifyInstall,
} from "./shopify-ingestion.server";

/**
 * Runs from Shopify's afterAuth hook, which fires on installs and whenever a
 * shop needs a new session. Only a first install or a reinstall alerts staff
 * and, on a development store, seeds the sample run.
 *
 * Recording the install is required; the alert and sample are best effort
 * and never fail the install.
 */
export async function handleShopifyInstall({
  db,
  shop,
  admin,
  getService,
  alert = sendOpsAlert,
}: {
  db: HollerDatabase;
  shop: string;
  admin: AdminGraphqlClient;
  getService: () => OperationsApplicationService;
  alert?: (text: string) => Promise<unknown>;
}): Promise<void> {
  const wasActive = await hasActiveShopifyInstall(db, shop);
  const merchantId = await recordShopifyInstall(db, shop);
  if (wasActive) return;

  const logFailure = (step: string, error: unknown) =>
    console.warn(
      JSON.stringify({
        event: "shopify.install_step_failed",
        step,
        shop,
        error: error instanceof Error ? error.message : typeof error,
      }),
    );
  const bestEffort = async (step: string, run: () => Promise<void>) => {
    try {
      await run();
      return true;
    } catch (error) {
      logFailure(step, error);
      return false;
    }
  };

  const development = await isDevelopmentStore(admin).catch(
    (error: unknown) => {
      logFailure("plan_check", error);
      return null;
    },
  );
  const seeded =
    development === true &&
    (await bestEffort("sample_run", () =>
      seedSampleRun(getService(), merchantId),
    )) &&
    (await bestEffort("sample_charge", () => seedSampleCharge(db, merchantId)));

  const kind =
    development === true
      ? "development store (likely an App Store reviewer)"
      : development === false
        ? "merchant store"
        : "store (plan check failed)";
  const lines = [
    `Holler installed on ${shop} (${kind}).`,
    development
      ? `${seeded ? "Sample run and $1 test charge added." : "Adding the sample run or test charge FAILED; check logs and run shopify:seed-reviewer."} Requests from this store go live automatically.`
      : "New requests will need staff review.",
  ];
  const merchantsUrl = staffUrl("/admin/merchants");
  if (merchantsUrl) lines.push(merchantsUrl);
  await alert(lines.join("\n"));
}
