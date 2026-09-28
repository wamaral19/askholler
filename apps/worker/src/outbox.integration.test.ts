import { randomUUID } from "node:crypto";
import { PostgresJobDispatcher, merchants, outboxEvents } from "@holler/db";
import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";
import { eq, sql } from "drizzle-orm";
import { runMigrations } from "graphile-worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GraphileOutboxDispatcher } from "./outbox";

const databaseUrl = testDatabaseUrl();
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("Graphile outbox dispatch integration", () => {
  let database: IsolatedTestDatabase;
  const merchantId = randomUUID();

  beforeAll(async () => {
    database = await createIsolatedTestDatabase(databaseUrl!);
    await runMigrations({ connectionString: database.databaseUrl });
    await database.db.insert(merchants).values({
      id: merchantId,
      name: "Synthetic merchant",
      timezone: "UTC",
      status: "active",
    });
  }, 30_000);

  afterAll(async () => database?.close(), 30_000);

  async function graphileJobCount(jobKey: string): Promise<number> {
    const result = await database.db.execute(sql`
      SELECT count(*)::int AS count
      FROM graphile_worker._private_jobs
      WHERE key = ${jobKey}
    `);
    return Number(result.rows[0]?.count ?? 0);
  }

  it("has a single winner and one logical job under concurrent drains", async () => {
    const receiptId = randomUUID();
    await new PostgresJobDispatcher(database.db, merchantId).enqueue({
      jobType: "normalize_webhook",
      idempotencyKey: receiptId,
      payload: { merchantId, receiptId },
    });
    const dispatcher = new GraphileOutboxDispatcher(database.db);
    const claimed = await Promise.all([
      dispatcher.drainBatch(1),
      dispatcher.drainBatch(1),
    ]);
    expect(claimed.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(await graphileJobCount(`normalize_webhook:${receiptId}`)).toBe(1);
  });

  it("deduplicates replay with a stable Graphile job key", async () => {
    const eventId = randomUUID();
    const key = `job:${merchantId}:evaluate_commerce_event:${eventId}`;
    await new PostgresJobDispatcher(database.db, merchantId).enqueue({
      jobType: "evaluate_commerce_event",
      idempotencyKey: eventId,
      payload: { merchantId, commerceEventId: eventId },
    });
    const dispatcher = new GraphileOutboxDispatcher(database.db);
    await dispatcher.drainBatch(10);
    await database.db
      .update(outboxEvents)
      .set({ dispatchedAt: null })
      .where(eq(outboxEvents.idempotencyKey, key));
    await dispatcher.drainBatch(10);
    expect(await graphileJobCount(`evaluate_commerce_event:${eventId}`)).toBe(
      1,
    );
  });

  it("rolls back the Graphile job if marking the outbox row fails", async () => {
    const assignmentId = randomUUID();
    const key = `expire_assignments:${assignmentId}`;
    await new PostgresJobDispatcher(database.db, merchantId).enqueue({
      jobType: "expire_assignments",
      idempotencyKey: assignmentId,
      payload: { merchantId, assignmentId },
    });
    await database.db.execute(
      sql.raw(`
      CREATE FUNCTION reject_dispatch_for_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test rejection'; END $$;
      CREATE TRIGGER reject_dispatch_for_test
      BEFORE UPDATE OF dispatched_at ON outbox_events
      FOR EACH ROW WHEN (NEW.event_type = 'expire_assignments')
      EXECUTE FUNCTION reject_dispatch_for_test();
    `),
    );
    await expect(
      new GraphileOutboxDispatcher(database.db).drainBatch(10),
    ).rejects.toThrow();
    expect(await graphileJobCount(key)).toBe(0);
    await database.db.execute(
      sql.raw("DROP TRIGGER reject_dispatch_for_test ON outbox_events"),
    );
  });
});
