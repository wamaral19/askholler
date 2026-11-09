import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createMerchant,
  listManagedMerchants,
  normalizeShopDomain,
} from "./merchant-admin.server";
import { shopifyMerchantId } from "./shopify-ingestion.server";
import { ensureStoreMerchant } from "./shopify-store-webhooks.server";

const databaseUrl = testDatabaseUrl();
const creator = {
  actorId: "00000000-0000-7000-8000-00000000b001",
  workforceUserId: null,
  roles: ["platform_admin"] as const,
};

describe("merchant creation rules", () => {
  it("reads a store's .myshopify.com address however it is pasted", () => {
    for (const value of [
      "acme",
      " Acme.myshopify.com ",
      "https://acme.myshopify.com/admin",
      "https://admin.shopify.com/store/acme/orders",
    ])
      expect(normalizeShopDomain(value)).toBe("acme.myshopify.com");
    for (const value of ["acme.com", "", "-acme", "acme.myshopify.com.evil"])
      expect(() => normalizeShopDomain(value)).toThrow(
        "MERCHANT_SHOP_DOMAIN_INVALID",
      );
  });
});

describe.skipIf(databaseUrl === undefined)("merchant creation", () => {
  let isolated: IsolatedTestDatabase;

  beforeAll(async () => {
    isolated = await createIsolatedTestDatabase(databaseUrl!);
  }, 30_000);

  afterAll(async () => isolated?.close());

  it("creates a merchant that the store's first webhook lands on", async () => {
    const merchantId = await createMerchant(
      isolated.db,
      {
        name: "Acme Outfitters",
        shopDomain: "acme",
        timezone: "America/Denver",
      },
      creator,
    );
    expect(merchantId).toBe(shopifyMerchantId("acme.myshopify.com"));
    const [merchant] = await listManagedMerchants(isolated.db, [merchantId]);
    expect(merchant).toMatchObject({
      name: "Acme Outfitters",
      shopDomain: "acme.myshopify.com",
      timezone: "America/Denver",
      status: "active",
      installedAt: null,
      loginDomains: [],
    });
    const scripts = await isolated.db.execute(
      sql`select status from scripts where merchant_id = ${merchantId}`,
    );
    expect(scripts.rows).toEqual([{ status: "published" }]);

    // The first verified order starts history and keeps the operator's setup.
    await ensureStoreMerchant(isolated.db, "acme.myshopify.com");
    const [installed] = await listManagedMerchants(isolated.db, [merchantId]);
    expect(installed?.installedAt).not.toBeNull();
    expect(installed).toMatchObject({
      name: "Acme Outfitters",
      timezone: "America/Denver",
    });
  });

  it("refuses a duplicate store, a bad timezone, and a blank name", async () => {
    await expect(
      createMerchant(
        isolated.db,
        { name: "Again", shopDomain: "acme", timezone: "UTC" },
        creator,
      ),
    ).rejects.toMatchObject({ code: "MERCHANT_EXISTS" });
    await expect(
      createMerchant(
        isolated.db,
        { name: "New", shopDomain: "new-store", timezone: "Mars/Olympus" },
        creator,
      ),
    ).rejects.toMatchObject({ code: "MERCHANT_TIMEZONE_INVALID" });
    await expect(
      createMerchant(
        isolated.db,
        { name: "  ", shopDomain: "new-store", timezone: "UTC" },
        creator,
      ),
    ).rejects.toMatchObject({ code: "MERCHANT_NAME_INVALID" });
  });

  it("gives a stored workforce creator their roles on the new merchant", async () => {
    const userId = "00000000-0000-7000-8000-00000000b002";
    await isolated.db.execute(sql`
      insert into workforce_users (id, email, status)
      values (${userId}, 'ops@withholler.com', 'active')`);
    const merchantId = await createMerchant(
      isolated.db,
      { name: "Second", shopDomain: "second", timezone: "UTC" },
      {
        actorId: userId,
        workforceUserId: userId,
        roles: ["platform_admin", "research_manager"],
      },
    );
    const grants = await isolated.db.execute(sql`
      select role from merchant_memberships
      where merchant_id = ${merchantId} and user_id = ${userId} and status = 'active'
      order by role`);
    expect(grants.rows).toEqual([
      { role: "platform_admin" },
      { role: "research_manager" },
    ]);
  });
});
