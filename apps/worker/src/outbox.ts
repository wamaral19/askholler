import { assertOperationalJobPayload, type HollerDatabase } from "@holler/db";
import { sql } from "drizzle-orm";
import { jobPolicies, jobSchemas, type JobName } from "./jobs";

interface OutboxRow {
  id: string;
  event_type: string;
  payload: unknown;
  idempotency_key: string;
}

export class OutboxDispatchError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OutboxDispatchError";
  }
}

export class GraphileOutboxDispatcher {
  constructor(private readonly db: HollerDatabase) {}

  async drainBatch(batchSize: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        SELECT id, event_type, payload, idempotency_key
        FROM outbox_events
        WHERE dispatched_at IS NULL
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      `);
      const rows = result.rows as unknown as OutboxRow[];
      for (const row of rows) {
        if (!(row.event_type in jobSchemas))
          throw new OutboxDispatchError("OUTBOX_EVENT_UNSUPPORTED");
        const taskName = row.event_type as JobName;
        let payload: Record<string, unknown>;
        try {
          payload = jobSchemas[taskName].parse(row.payload);
          assertOperationalJobPayload(payload);
        } catch {
          throw new OutboxDispatchError("OUTBOX_PAYLOAD_REJECTED");
        }
        const policy = jobPolicies[taskName];
        const jobKey = policy.idempotencyKey(payload as never);
        await tx.execute(sql`
          SELECT graphile_worker.add_job(
            ${taskName}, ${JSON.stringify(payload)}::json,
            NULL, NULL, ${policy.maxAttempts}, ${jobKey}, NULL, NULL, 'replace'
          )
        `);
        await tx.execute(sql`
          UPDATE outbox_events
          SET dispatched_at = now()
          WHERE id = ${row.id} AND dispatched_at IS NULL
        `);
      }
      return rows.length;
    });
  }
}
