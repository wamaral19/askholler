import { randomUUID } from "node:crypto";
import { PostgresJobDispatcher, PostgresJobQueue, merchants } from "@holler/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "./postgres-test-database";

const databaseUrl = testDatabaseUrl();

describe.skipIf(databaseUrl === undefined)(
  "PostgreSQL durable worker queue",
  () => {
    let isolated: IsolatedTestDatabase;
    const merchantId = "00000000-0000-7000-8000-000000008001";

    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(databaseUrl!);
      await isolated.db.insert(merchants).values({
        id: merchantId,
        name: "Synthetic Queue Merchant",
        shopDomain: "queue-synthetic.myshopify.com",
        timezone: "America/New_York",
        status: "active",
      });
    }, 30_000);

    afterAll(async () => isolated?.close());

    it("deduplicates dispatch, gives a claim to one worker, and completes it", async () => {
      const dispatcher = new PostgresJobDispatcher(isolated.db, merchantId);
      await dispatcher.enqueue({
        jobType: "synthetic.verify",
        idempotencyKey: "event-1",
        payload: { eventId: "opaque-1" },
      });
      await dispatcher.enqueue({
        jobType: "synthetic.verify",
        idempotencyKey: "event-1",
        payload: { eventId: "opaque-1" },
      });

      const queue = new PostgresJobQueue(isolated.db);
      const [first, second] = await Promise.all([
        queue.claim(`worker-${randomUUID()}`),
        queue.claim(`worker-${randomUUID()}`),
      ]);
      const claimed = [first, second].filter(Boolean);
      expect(claimed).toHaveLength(1);
      const row = claimed[0] as Record<string, unknown>;
      expect(row.attempts).toBe(1);
      expect(
        await queue.complete(
          merchantId,
          row.id as string,
          row.locked_by as string,
        ),
      ).toMatchObject({ status: "completed" });
    });

    it("recovers an abandoned lock without duplicating the job", async () => {
      const dispatcher = new PostgresJobDispatcher(isolated.db, merchantId);
      await dispatcher.enqueue({
        jobType: "synthetic.recover",
        idempotencyKey: "event-2",
        payload: { eventId: "opaque-2" },
      });
      const queue = new PostgresJobQueue(isolated.db);
      const claimed = (await queue.claim(
        "dead-worker",
        new Date("2026-09-24T10:00:00.000Z"),
      )) as Record<string, unknown>;
      const recovered = await queue.recoverStaleLocks(
        new Date("2026-09-24T10:01:00.000Z"),
        new Date("2026-09-24T10:05:00.000Z"),
      );
      expect(recovered).toHaveLength(1);
      expect(
        await queue.claim(
          "replacement-worker",
          new Date("2026-09-24T10:05:00.000Z"),
        ),
      ).toMatchObject({ id: claimed.id, attempts: 2 });
    });
  },
);
