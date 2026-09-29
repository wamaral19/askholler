import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";

import { GOOGLE_ISSUER } from "./google-oidc.server";
import {
  DatabaseWorkforceContextResolver,
  WORKFORCE_SESSION_TTL_MS,
  WorkforceDirectory,
} from "./workforce-directory.server";

const databaseUrl = testDatabaseUrl();
const merchantA = "00000000-0000-7000-8000-000000004001";
const merchantB = "00000000-0000-7000-8000-000000004002";
const email = "researcher@withholler.com";
const identity = { issuer: GOOGLE_ISSUER, subject: "google-sub-1", email };

function request(token: string, merchant?: string) {
  const cookies = [`holler_workforce_session=${token}`];
  if (merchant) cookies.push(`holler_workforce_merchant=${merchant}`);
  return new Request("https://app.holler.invalid/queue", {
    headers: { cookie: cookies.join("; ") },
  });
}

describe.skipIf(databaseUrl === undefined)(
  "PostgreSQL workforce directory",
  () => {
    let isolated: IsolatedTestDatabase;
    let now = new Date("2026-09-29T16:00:00.000Z");
    let directory: WorkforceDirectory;
    let resolver: DatabaseWorkforceContextResolver;

    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(databaseUrl!);
      await isolated.db.execute(sql`
        insert into merchants (id, name, timezone, status)
        values (${merchantA}, 'Synthetic Merchant A', 'UTC', 'active'),
               (${merchantB}, 'Synthetic Merchant B', 'UTC', 'active')`);
      directory = new WorkforceDirectory(isolated.db, () => now);
      resolver = new DatabaseWorkforceContextResolver(directory);
    });

    afterAll(async () => {
      await isolated?.close();
    });

    it("refuses sign-in for an unprovisioned account", async () => {
      await expect(directory.signIn(identity)).rejects.toMatchObject({
        code: "WORKFORCE_NOT_PROVISIONED",
      });
    });

    it("binds a provisioned email on first sign-in and resolves per-merchant roles", async () => {
      const userId = await directory.provisionUser(
        " Researcher@WithHoller.com ",
      );
      await directory.grantRole(email, merchantA, "researcher");
      await directory.grantRole(email, merchantB, "research_manager");
      const token = await directory.signIn(identity);

      expect(await resolver.resolve(request(token))).toMatchObject({
        merchantId: merchantA,
        merchantIds: [merchantA, merchantB],
        researcherId: userId,
        roles: ["researcher"],
      });
      expect(await resolver.resolve(request(token, merchantB))).toMatchObject({
        merchantId: merchantB,
        roles: ["research_manager"],
      });
      // An unrelated merchant cookie cannot widen access.
      expect(
        (await resolver.resolve(request(token, crypto.randomUUID())))
          .merchantId,
      ).toBe(merchantA);

      // The bound subject is required from then on.
      await expect(
        directory.signIn({ ...identity, subject: "a-different-google-user" }),
      ).rejects.toMatchObject({ code: "WORKFORCE_NOT_PROVISIONED" });
    });

    it("applies revocation, role removal, and expiry on the next request", async () => {
      const token = await directory.signIn(identity);
      await directory.revokeRole(email, merchantB, "research_manager");
      expect((await resolver.resolve(request(token))).merchantIds).toEqual([
        merchantA,
      ]);

      await directory.revokeSession(token);
      await expect(resolver.resolve(request(token))).rejects.toMatchObject({
        code: "WORKFORCE_IDENTITY_INVALID",
      });

      const expiring = await directory.signIn(identity);
      now = new Date(now.getTime() + WORKFORCE_SESSION_TTL_MS + 1);
      await expect(resolver.resolve(request(expiring))).rejects.toMatchObject({
        code: "WORKFORCE_IDENTITY_INVALID",
      });
    });

    it("disabling a user ends every open session and blocks new ones", async () => {
      const first = await directory.signIn(identity);
      const second = await directory.signIn(identity);
      await directory.disableUser(email);
      for (const token of [first, second])
        await expect(resolver.resolve(request(token))).rejects.toMatchObject({
          code: "WORKFORCE_IDENTITY_INVALID",
        });
      await expect(directory.signIn(identity)).rejects.toMatchObject({
        code: "WORKFORCE_NOT_PROVISIONED",
      });
    });

    it("stores only a hash of the session token", async () => {
      await directory.provisionUser(email);
      const token = await directory.signIn(identity);
      const rows = await isolated.db.execute(
        sql`select token_hash from workforce_sessions`,
      );
      expect(JSON.stringify(rows.rows)).not.toContain(token);
    });

    it("rejects a user with no active memberships", async () => {
      await directory.provisionUser("analyst@withholler.com");
      const token = await directory.signIn({
        issuer: GOOGLE_ISSUER,
        subject: "google-sub-2",
        email: "analyst@withholler.com",
      });
      await expect(resolver.resolve(request(token))).rejects.toMatchObject({
        code: "WORKFORCE_IDENTITY_DISABLED",
      });
    });
  },
);
