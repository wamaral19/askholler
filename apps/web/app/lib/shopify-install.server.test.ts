import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_CHARGE_DESCRIPTION,
  SAMPLE_RUN_NAME,
  launchDevelopmentStoreRequest,
  launchIfDevelopmentStore,
} from "./development-store.server";
import { listMerchantCharges } from "./merchant-billing.server";
import type { TenantContext } from "./operations-types";
import {
  PostgresOperationsApplicationService,
  PrefixedSyntheticPhoneDecryptor,
} from "./postgres-operations-service.server";
import type { AdminGraphqlClient } from "./shopify-billing.server";
import { shopifyMerchantId } from "./shopify-ingestion.server";
import { handleShopifyInstall } from "./shopify-install.server";

function adminFor(partnerDevelopment: boolean | "error"): AdminGraphqlClient {
  return {
    graphql: async () =>
      partnerDevelopment === "error"
        ? Response.json({ errors: ["boom"] })
        : Response.json({ data: { shop: { plan: { partnerDevelopment } } } }),
  };
}

function merchantContext(shop: string): TenantContext {
  const merchantId = shopifyMerchantId(shop);
  return {
    merchantId,
    merchantIds: [merchantId],
    researcherId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    roles: [],
    viewer: "merchant",
  };
}

describe("launchIfDevelopmentStore", () => {
  it("launches only on development stores", async () => {
    const launch = vi.fn(async () => {});
    expect(await launchIfDevelopmentStore(adminFor(false), launch)).toBe(false);
    expect(await launchIfDevelopmentStore(undefined, launch)).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    expect(await launchIfDevelopmentStore(adminFor(true), launch)).toBe(true);
    expect(launch).toHaveBeenCalledOnce();
  });

  it("leaves the request a draft when the check or launch fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await launchIfDevelopmentStore(adminFor("error"), async () => {}),
    ).toBe(false);
    expect(
      await launchIfDevelopmentStore(adminFor(true), async () => {
        throw new Error("conflict");
      }),
    ).toBe(false);
  });
});

const databaseUrl = testDatabaseUrl();

describe.skipIf(databaseUrl === undefined)(
  "Shopify install handling and development-store requests",
  () => {
    let isolated: IsolatedTestDatabase;
    let service: PostgresOperationsApplicationService;

    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(databaseUrl!);
      service = new PostgresOperationsApplicationService(
        isolated.db,
        new PrefixedSyntheticPhoneDecryptor(),
      );
    }, 30_000);

    afterAll(async () => isolated?.close(), 30_000);

    const install = (shop: string, admin: AdminGraphqlClient) => {
      const alert = vi.fn(async (_text: string) => {});
      return {
        alert,
        run: () =>
          handleShopifyInstall({
            db: isolated.db,
            shop,
            admin,
            getService: () => service,
            alert,
          }),
      };
    };

    it("seeds a sample run and alerts once for a development store", async () => {
      const shop = "reviewer-dev.myshopify.com";
      const first = install(shop, adminFor(true));
      await first.run();
      expect(first.alert).toHaveBeenCalledOnce();
      expect(first.alert.mock.calls[0]![0]).toContain("development store");

      const context = merchantContext(shop);
      const runs = await service.listCompletedRuns(context);
      expect(runs.map((run) => run.name)).toEqual([SAMPLE_RUN_NAME]);
      expect(runs[0]!.reportUrl).toBe("https://withholler.com/sample-report");
      expect(first.alert.mock.calls[0]![0]).toContain("$1 test charge added");
      const charges = await listMerchantCharges(
        isolated.db,
        context.merchantId,
      );
      expect(charges).toMatchObject([
        {
          description: SAMPLE_CHARGE_DESCRIPTION,
          amountMinor: 100,
          kind: "one_time",
          status: "pending",
        },
      ]);

      // A later re-authentication is not a new install.
      const again = install(shop, adminFor(true));
      await again.run();
      expect(again.alert).not.toHaveBeenCalled();
      expect(await service.listCompletedRuns(context)).toHaveLength(1);
      expect(
        await listMerchantCharges(isolated.db, context.merchantId),
      ).toHaveLength(1);
    });

    it("adds no sample for a merchant store but still alerts", async () => {
      const shop = "real-merchant.myshopify.com";
      const { alert, run } = install(shop, adminFor(false));
      await run();
      expect(alert.mock.calls[0]![0]).toContain("merchant store");
      expect(await service.listMoments(merchantContext(shop))).toHaveLength(0);
    });

    it("records the install even when the plan check fails", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const shop = "flaky-plan.myshopify.com";
      const { alert, run } = install(shop, adminFor("error"));
      await run();
      expect(alert.mock.calls[0]![0]).toContain("plan check failed");
      expect(await service.listMoments(merchantContext(shop))).toHaveLength(0);
    });

    it("launches a development store's request and keeps it marked as requested", async () => {
      const shop = "reviewer-dev.myshopify.com";
      const context = merchantContext(shop);
      const [field] = await service.listResearchFields(context);
      const input = {
        name: "Why do first-time customers choose us?",
        objective: "Learn what convinced first-time buyers.",
        weeklyTarget: 3,
        cohortExpression: {
          predicate: "customer.order_sequence",
          version: 1,
          config: { operator: "equals", value: 1 },
        },
        fields: [
          {
            kind: "library" as const,
            fieldVersionId: field!.id,
            required: true,
          },
        ],
      };
      const { id } = await service.saveMoment(context, {
        ...input,
        publish: false,
      });
      await launchDevelopmentStoreRequest(
        service,
        context.merchantId,
        id,
        input,
      );
      const moment = (await service.listMoments(context)).find(
        (candidate) => candidate.id === id,
      );
      expect(moment?.status).toBe("live");
      expect(moment?.requestedByMerchant).toBe(true);
    });
  },
);
