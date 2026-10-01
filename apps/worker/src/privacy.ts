import {
  deletionRequests,
  deletionSteps,
  type HollerDatabase,
  type PrivacySubject,
} from "@holler/db";
import type { PrivateObjectStore } from "@holler/domain";
import {
  DeletionService,
  type DeletionRepository,
  type DeletionStep,
} from "@holler/providers";
import { and, eq, inArray, lte, sql } from "drizzle-orm";

/** Raw recordings are deleted 30 days after they are made (signoff schedule). */
export const RECORDING_RETENTION_DAYS = 30;

export interface PrivacyDependencies {
  /** Private recording storage; required once any recording exists. */
  readonly objectStore?: Pick<PrivateObjectStore, "delete"> | undefined;
  /** Deletes the provider's copy of a recording; must treat 404 as success. */
  readonly deleteProviderRecording?:
    ((providerRef: string) => Promise<void>) | undefined;
  readonly now: () => Date;
}

/**
 * Ordered, idempotent erasure steps for one customer or a whole shop. Each
 * step can be retried alone; none logs or returns subject data.
 */
export function erasureSteps(
  db: HollerDatabase,
  dependencies: PrivacyDependencies,
  merchantId: string,
  subject: PrivacySubject,
): DeletionStep[] {
  const customerFilter =
    subject.scope === "customer"
      ? sql`customer_id = ${subject.customerId}`
      : sql`true`;
  const interviewIds = sql`
    select i.id from interviews i
    join research_assignments a
      on a.id = i.research_assignment_id and a.merchant_id = i.merchant_id
    where i.merchant_id = ${merchantId} and ${
      subject.scope === "customer"
        ? sql`a.customer_id = ${subject.customerId}`
        : sql`true`
    }`;

  return [
    {
      key: "assignments.cancel",
      async delete() {
        const now = dependencies.now();
        await db.execute(sql`
          with open as (
            select id, status from research_assignments
            where merchant_id = ${merchantId} and ${customerFilter}
              and status in ('queued', 'claimed', 'no_answer', 'interview_started')
            for update
          ), cancelled as (
            update research_assignments a
            set status = 'cancelled', lock_version = a.lock_version + 1, updated_at = ${now}
            from open where a.id = open.id
            returning a.id, open.status as from_status, a.lock_version
          )
          insert into assignment_transitions
            (id, merchant_id, assignment_id, from_status, to_status, actor_id, occurred_at, lock_version, metadata)
          select gen_random_uuid(), ${merchantId}, id, from_status, 'cancelled', null, ${now}, lock_version,
                 '{"reason":"privacy_erasure"}'::jsonb
          from cancelled`);
      },
    },
    {
      key: "recordings.delete",
      async delete() {
        const rows = await db.execute<{
          id: string;
          object_key: string;
          provider_ref: string | null;
          status: string;
        }>(sql`
          select id, object_key, provider_ref, status from recordings
          where merchant_id = ${merchantId} and deleted_at is null
            and interview_id in (${interviewIds})`);
        for (const row of rows.rows) {
          await deleteRecordingCopies(dependencies, row);
          await db.execute(sql`
            update recordings set status = 'deleted', deleted_at = ${dependencies.now()},
              updated_at = ${dependencies.now()}
            where id = ${row.id} and merchant_id = ${merchantId}`);
        }
      },
    },
    {
      key: "interview_text.redact",
      async delete() {
        // Structured answers (selects, ratings) are not personal data and
        // stay as research evidence; free text and excerpts are removed.
        await db.execute(sql`
          update interview_observations set note = '[redacted]', updated_at = ${dependencies.now()}
          where merchant_id = ${merchantId} and note <> '[redacted]'
            and interview_id in (${interviewIds})`);
        await db.execute(sql`
          update interview_responses r
          set value = '{"redacted":true}'::jsonb, updated_at = ${dependencies.now()}
          from research_field_versions v
          where r.merchant_id = ${merchantId}
            and v.id = r.research_field_version_id
            and v.definition->>'valueType' in ('short_text', 'long_text')
            and r.value <> '{"redacted":true}'::jsonb
            and r.interview_id in (${interviewIds})`);
        await db.execute(sql`
          update response_evidence e set excerpt_snapshot = null
          from interview_responses r
          where e.merchant_id = ${merchantId} and e.response_id = r.id
            and e.excerpt_snapshot is not null
            and r.interview_id in (${interviewIds})`);
      },
    },
    {
      key: "customer_private.erase",
      async delete() {
        await eraseCustomerPrivate(
          db,
          merchantId,
          customerFilter,
          dependencies.now(),
        );
      },
    },
    {
      key: "customers.mark_deleted",
      async delete() {
        const now = dependencies.now();
        await db.execute(sql`
          update customers
          set deleted_at = coalesce(deleted_at, ${now}), contactability_status = 'suppressed',
              updated_at = ${now}
          where merchant_id = ${merchantId} and ${
            subject.scope === "customer"
              ? sql`id = ${subject.customerId}`
              : sql`true`
          }`);
      },
    },
  ];
}

async function deleteRecordingCopies(
  dependencies: PrivacyDependencies,
  row: { object_key: string; provider_ref: string | null; status: string },
): Promise<void> {
  // "stored" means the provider copy was already verified deleted.
  const inObjectStore = row.status.startsWith("stored");
  const atProvider = row.status !== "stored" && row.provider_ref !== null;
  if (inObjectStore) {
    if (!dependencies.objectStore) throw new Error("OBJECT_STORE_UNAVAILABLE");
    await dependencies.objectStore.delete(row.object_key);
  }
  if (atProvider) {
    if (!dependencies.deleteProviderRecording)
      throw new Error("PROVIDER_DELETION_UNAVAILABLE");
    await dependencies.deleteProviderRecording(row.provider_ref!);
  }
}

async function eraseCustomerPrivate(
  db: HollerDatabase,
  merchantId: string,
  filter: ReturnType<typeof sql>,
  now: Date,
): Promise<number> {
  const result = await db.execute(sql`
    update customer_private
    set encrypted_phone_e164 = null, encrypted_given_name = null, phone_last_four = null,
        deleted_at = ${now}, updated_at = ${now}
    where merchant_id = ${merchantId} and ${filter}
      and (encrypted_phone_e164 is not null or encrypted_given_name is not null
           or phone_last_four is not null)`);
  return result.rowCount ?? 0;
}

export class PostgresDeletionRepository implements DeletionRepository {
  constructor(private readonly db: HollerDatabase) {}

  async getRequest(merchantId: string, requestId: string) {
    const [row] = await this.db
      .select()
      .from(deletionRequests)
      .where(
        and(
          eq(deletionRequests.merchantId, merchantId),
          eq(deletionRequests.id, requestId),
        ),
      );
    return row
      ? {
          id: row.id,
          merchantId: row.merchantId,
          scope: row.scope as "customer" | "shop",
          subjectRefHash: row.subjectRefHash,
          status: row.status as
            | "pending"
            | "running"
            | "completed"
            | "blocked_legal_hold"
            | "failed",
          legalHold: row.legalHold,
        }
      : undefined;
  }

  async begin(merchantId: string, requestId: string) {
    await this.setStatus(merchantId, requestId, "running");
  }

  async isStepComplete(merchantId: string, requestId: string, key: string) {
    const [row] = await this.db
      .select({ status: deletionSteps.status })
      .from(deletionSteps)
      .where(
        and(
          eq(deletionSteps.merchantId, merchantId),
          eq(deletionSteps.requestId, requestId),
          eq(deletionSteps.stepKey, key),
        ),
      );
    return row?.status === "completed";
  }

  async completeStep(
    merchantId: string,
    requestId: string,
    key: string,
    completedAt: Date,
  ) {
    await this.upsertStep(merchantId, requestId, key, {
      status: "completed",
      completedAt,
      safeErrorCode: null,
    });
  }

  async failStep(
    merchantId: string,
    requestId: string,
    key: string,
    safeErrorCode: string,
  ) {
    await this.upsertStep(merchantId, requestId, key, {
      status: "failed",
      safeErrorCode,
      completedAt: null,
    });
    await this.setStatus(merchantId, requestId, "failed");
  }

  async complete(merchantId: string, requestId: string, completedAt: Date) {
    await this.db
      .update(deletionRequests)
      .set({ status: "completed", completedAt, updatedAt: completedAt })
      .where(
        and(
          eq(deletionRequests.merchantId, merchantId),
          eq(deletionRequests.id, requestId),
        ),
      );
  }

  private async setStatus(
    merchantId: string,
    requestId: string,
    status: string,
  ) {
    await this.db
      .update(deletionRequests)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(deletionRequests.merchantId, merchantId),
          eq(deletionRequests.id, requestId),
        ),
      );
  }

  private async upsertStep(
    merchantId: string,
    requestId: string,
    stepKey: string,
    values: {
      status: string;
      completedAt: Date | null;
      safeErrorCode: string | null;
    },
  ) {
    await this.db
      .insert(deletionSteps)
      .values({ requestId, merchantId, stepKey, attempts: 1, ...values })
      .onConflictDoUpdate({
        target: [deletionSteps.requestId, deletionSteps.stepKey],
        set: {
          ...values,
          attempts: sql`${deletionSteps.attempts} + 1`,
          updatedAt: new Date(),
        },
      });
  }
}

export interface PrivacySweepResult {
  readonly requestsCompleted: number;
  readonly requestsFailed: number;
  readonly requestsOnLegalHold: number;
  readonly requestsOverdue: number;
  readonly customerPiiExpired: number;
  readonly recordingsExpired: number;
  readonly recordingsFailed: number;
}

/**
 * Runs hourly from the worker's crontab: executes pending deletion requests,
 * then applies the retention schedule. Logs only counts and safe codes; any
 * failure or overdue request is logged at error level for alerting.
 */
export async function runPrivacySweep(
  db: HollerDatabase,
  dependencies: PrivacyDependencies,
  log: (event: Record<string, unknown>) => void = (event) =>
    console[
      event.requestsFailed || event.requestsOverdue || event.recordingsFailed
        ? "error"
        : "info"
    ](JSON.stringify(event)),
): Promise<PrivacySweepResult> {
  const now = dependencies.now();
  const service = new DeletionService(
    new PostgresDeletionRepository(db),
    dependencies.now,
  );
  const open = await db
    .select()
    .from(deletionRequests)
    .where(
      inArray(deletionRequests.status, [
        "pending",
        "running",
        "failed",
        "blocked_legal_hold",
      ]),
    );
  let requestsCompleted = 0;
  let requestsFailed = 0;
  let requestsOnLegalHold = 0;
  for (const request of open) {
    const subject: PrivacySubject =
      request.scope === "customer" && request.subjectId
        ? { scope: "customer", customerId: request.subjectId }
        : { scope: "shop" };
    try {
      const outcome = await service.execute(
        request.merchantId,
        request.id,
        erasureSteps(db, dependencies, request.merchantId, subject),
      );
      if (outcome === "completed") requestsCompleted += 1;
      else requestsOnLegalHold += 1;
    } catch {
      requestsFailed += 1;
    }
  }
  const [overdue] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deletionRequests)
    .where(
      and(
        inArray(deletionRequests.status, ["pending", "running", "failed"]),
        lte(deletionRequests.dueAt, now),
      ),
    );

  // Retention: recruitment PII past its expiry.
  const expired = await db.execute<{ count: number }>(sql`
    with erased as (
      update customer_private
      set encrypted_phone_e164 = null, encrypted_given_name = null, phone_last_four = null,
          deleted_at = ${now}, updated_at = ${now}
      where deleted_at is null and expires_at <= ${now}
      returning merchant_id, customer_id
    ), uncontactable as (
      update customers c set contactability_status = 'no_phone', updated_at = ${now}
      from erased
      where c.merchant_id = erased.merchant_id and c.id = erased.customer_id
        and c.contactability_status = 'eligible'
      returning c.id
    )
    select count(*)::int as count from erased`);

  // Retention: raw recordings older than 30 days.
  const recordingRows = await db.execute<{
    id: string;
    merchant_id: string;
    object_key: string;
    provider_ref: string | null;
    status: string;
  }>(sql`
    select id, merchant_id, object_key, provider_ref, status from recordings
    where deleted_at is null
      and coalesce(expires_at, created_at + make_interval(days => ${RECORDING_RETENTION_DAYS})) <= ${now}`);
  let recordingsExpired = 0;
  let recordingsFailed = 0;
  for (const row of recordingRows.rows) {
    try {
      await deleteRecordingCopies(dependencies, row);
      await db.execute(sql`
        update recordings set status = 'deleted', deleted_at = ${now}, updated_at = ${now}
        where id = ${row.id} and merchant_id = ${row.merchant_id}`);
      recordingsExpired += 1;
    } catch {
      recordingsFailed += 1;
    }
  }

  const result: PrivacySweepResult = {
    requestsCompleted,
    requestsFailed,
    requestsOnLegalHold,
    requestsOverdue: overdue?.count ?? 0,
    customerPiiExpired: expired.rows[0]?.count ?? 0,
    recordingsExpired,
    recordingsFailed,
  };
  log({ event: "privacy.sweep_completed", ...result });
  return result;
}

/** Deletes a Twilio-hosted recording; a 404 means it is already gone. */
export function twilioRecordingDeleter(
  accountSid: string,
  authToken: string,
  fetchImpl: typeof fetch = fetch,
): (providerRef: string) => Promise<void> {
  const authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
  return async (providerRef) => {
    if (!/^RE[0-9a-fA-F]{32}$/.test(providerRef))
      throw new Error("RECORDING_REF_INVALID");
    const response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${providerRef}.json`,
      { method: "DELETE", headers: { Authorization: authorization } },
    );
    if (!response.ok && response.status !== 404)
      throw new Error(`TWILIO_DELETE_FAILED_${response.status}`);
  };
}
