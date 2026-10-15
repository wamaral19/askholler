import { requestDeletion } from "@holler/db";
import {
  createIsolatedTestDatabase,
  persistedCanonicalIds as ids,
  seedPersistedCanonicalFlow,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runPrivacySweep, twilioRecordingDeleter } from "./privacy";

const databaseUrl = testDatabaseUrl();
const bystander = "00000000-0000-7000-8000-000000006001";
const recording = "00000000-0000-7000-8000-000000006002";

describe.skipIf(databaseUrl === undefined)("privacy sweep", () => {
  let isolated: IsolatedTestDatabase;
  let now = new Date("2026-09-29T12:00:00.000Z");
  const logs: Record<string, unknown>[] = [];
  const row = async (query: ReturnType<typeof sql>) =>
    (await isolated.db.execute(query)).rows[0] as Record<string, unknown>;

  beforeAll(async () => {
    isolated = await createIsolatedTestDatabase(databaseUrl!);
    await seedPersistedCanonicalFlow(isolated.db);
    await isolated.db.execute(sql`
      insert into customers (id, merchant_id, order_count, history_completeness, contactability_status)
      values (${bystander}, ${ids.merchant}, 1, '{}'::jsonb, 'eligible')`);
    await isolated.db.execute(sql`
      insert into customer_private (customer_id, merchant_id, encrypted_phone_e164, phone_last_four, key_version, expires_at)
      values (${bystander}, ${ids.merchant}, 'env1:bystander', '0199', '1', ${new Date("2026-12-01T00:00:00.000Z")})`);
    await isolated.db.execute(sql`
      insert into recordings (id, merchant_id, interview_id, provider, provider_ref, object_key, status, consent_status, created_at)
      values (${recording}, ${ids.merchant}, ${ids.interview}, 'twilio', ${`RE${"a".repeat(32)}`},
              'recordings/canonical.mp3', 'stored', 'granted', ${now})`);
  }, 30_000);

  afterAll(async () => isolated?.close());

  const sweep = (
    dependencies: Partial<Parameters<typeof runPrivacySweep>[1]>,
  ) =>
    runPrivacySweep(isolated.db, { now: () => now, ...dependencies }, (event) =>
      logs.push(event),
    );

  it("leaves a request on legal hold untouched", async () => {
    const requestId = await requestDeletion(
      isolated.db,
      ids.merchant,
      { scope: "customer", customerId: ids.customer },
      now,
    );
    await isolated.db.execute(
      sql`update deletion_requests set legal_hold = true where id = ${requestId}`,
    );
    const result = await sweep({});
    expect(result).toMatchObject({
      requestsOnLegalHold: 1,
      requestsCompleted: 0,
    });
    expect(
      await row(
        sql`select encrypted_phone_e164 from customer_private where customer_id = ${ids.customer}`,
      ),
    ).toMatchObject({ encrypted_phone_e164: "synthetic:v1:encrypted-phone" });
    await isolated.db.execute(
      sql`update deletion_requests set legal_hold = false where id = ${requestId}`,
    );
  });

  it("fails closed without recording storage, then completes on retry", async () => {
    const failed = await sweep({});
    expect(failed.requestsFailed).toBe(1);
    const step = await row(
      sql`select status, safe_error_code from deletion_steps where step_key = 'recordings.delete'`,
    );
    expect(step).toEqual({
      status: "failed",
      safe_error_code: "ERASURE_STEP_FAILED",
    });

    const objectStore = { delete: vi.fn(async () => undefined) };
    const deleteProviderRecording = vi.fn(async () => undefined);
    const completed = await sweep({ objectStore, deleteProviderRecording });
    expect(completed).toMatchObject({
      requestsCompleted: 1,
      requestsFailed: 0,
    });
    expect(objectStore.delete).toHaveBeenCalledWith("recordings/canonical.mp3");
    // Already transferred, so Twilio's copy was deleted at transfer time.
    expect(deleteProviderRecording).not.toHaveBeenCalled();
    // A second request for the same subject is the same request.
    expect(
      await requestDeletion(
        isolated.db,
        ids.merchant,
        { scope: "customer", customerId: ids.customer },
        now,
      ),
    ).toBeDefined();
    expect(
      await row(sql`select count(*)::int as count from deletion_requests`),
    ).toEqual({ count: 1 });
  });

  it("erased the subject's contact data, recordings, and free text only", async () => {
    expect(
      await row(sql`
        select encrypted_phone_e164, encrypted_given_name, phone_last_four, deleted_at is not null as deleted
        from customer_private where customer_id = ${ids.customer}`),
    ).toEqual({
      encrypted_phone_e164: null,
      encrypted_given_name: null,
      phone_last_four: null,
      deleted: true,
    });
    expect(
      await row(
        sql`select contactability_status, deleted_at is not null as deleted from customers where id = ${ids.customer}`,
      ),
    ).toEqual({ contactability_status: "suppressed", deleted: true });
    expect(
      await row(
        sql`select status, deleted_at is not null as deleted from recordings where id = ${recording}`,
      ),
    ).toEqual({ status: "deleted", deleted: true });
    expect(
      await row(
        sql`select note from interview_observations where interview_id = ${ids.interview}`,
      ),
    ).toEqual({ note: "[redacted]" });
    expect(
      await row(sql`
        select count(*)::int as count from response_evidence e
        join interview_responses r on r.id = e.response_id
        where r.interview_id = ${ids.interview} and e.excerpt_snapshot is not null`),
    ).toEqual({ count: 0 });
    // Completed assignments stay completed; only open work is cancelled.
    expect(
      await row(
        sql`select status from research_assignments where id = ${ids.assignment}`,
      ),
    ).toEqual({ status: "completed" });
    expect(
      await row(
        sql`select encrypted_phone_e164, deleted_at from customer_private where customer_id = ${bystander}`,
      ),
    ).toEqual({ encrypted_phone_e164: "env1:bystander", deleted_at: null });
    expect(JSON.stringify(logs)).not.toMatch(/env1:|synthetic:v1|Customer\//);
  });

  it("applies the retention schedule to expired PII and old recordings", async () => {
    await isolated.db.execute(sql`
      update recordings
      set status = 'stored_pending_source_delete', provider_ref = ${`RE${"b".repeat(32)}`},
          object_key = 'recordings/old.mp3', deleted_at = null
      where id = ${recording}`);
    now = new Date("2026-12-02T00:00:00.000Z");
    const objectStore = { delete: vi.fn(async () => undefined) };
    const deleteProviderRecording = vi.fn(async () => undefined);
    const result = await sweep({ objectStore, deleteProviderRecording });
    expect(result).toMatchObject({
      customerPiiExpired: 1,
      recordingsExpired: 1,
    });
    expect(objectStore.delete).toHaveBeenCalledWith("recordings/old.mp3");
    // Not yet removed from Twilio, so both copies are deleted.
    expect(deleteProviderRecording).toHaveBeenCalledWith(`RE${"b".repeat(32)}`);
    expect(
      await row(
        sql`select encrypted_phone_e164 from customer_private where customer_id = ${bystander}`,
      ),
    ).toEqual({ encrypted_phone_e164: null });
    expect(
      await row(
        sql`select contactability_status from customers where id = ${bystander}`,
      ),
    ).toEqual({ contactability_status: "no_phone" });
  });

  it("reports a failing, overdue request for alerting", async () => {
    await isolated.db.execute(sql`
      update recordings
      set status = 'stored', provider_ref = null, object_key = 'recordings/new.mp3',
          deleted_at = null, created_at = ${now}
      where id = ${recording}`);
    await requestDeletion(
      isolated.db,
      ids.merchant,
      { scope: "shop" },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    // No object store: the shop erasure cannot finish and is past due.
    const result = await sweep({});
    expect(result).toMatchObject({ requestsFailed: 1, requestsOverdue: 1 });
    expect(logs.at(-1)).toMatchObject({
      event: "privacy.sweep_completed",
      requestsOverdue: 1,
    });
  });
});

describe("Twilio recording deletion", () => {
  it("treats 404 as already deleted and surfaces only the status otherwise", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response("secret body", { status: 500 }));
    const remove = twilioRecordingDeleter(
      `AC${"1".repeat(32)}`,
      "auth-token-value-1234",
      fetchMock as unknown as typeof fetch,
    );
    await expect(remove(`RE${"c".repeat(32)}`)).resolves.toBeUndefined();
    await expect(remove(`RE${"c".repeat(32)}`)).rejects.toThrow(
      "TWILIO_DELETE_FAILED_500",
    );
    await expect(remove("not-a-sid")).rejects.toThrow("RECORDING_REF_INVALID");
  });
});
