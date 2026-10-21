import {
  createIsolatedTestDatabase,
  persistedCanonicalIds as ids,
  seedPersistedCanonicalFlow,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "./operations-types";
import {
  PostgresOperationsApplicationService,
  PrefixedSyntheticPhoneDecryptor,
} from "./postgres-operations-service.server";

const databaseUrl = testDatabaseUrl();
const teammate = "00000000-0000-7000-8000-000000009101";
const field = "00000000-0000-7000-8000-000000009103";
const fieldVersion = "00000000-0000-7000-8000-000000009104";

describe.skipIf(databaseUrl === undefined)("completed call review", () => {
  let isolated: IsolatedTestDatabase;
  let service: PostgresOperationsApplicationService;
  const as = (
    researcherId: string,
    roles: TenantContext["roles"] = ["researcher"],
  ): TenantContext => ({
    merchantId: ids.merchant,
    merchantIds: [ids.merchant],
    researcherId,
    roles,
    correlationId: "00000000-0000-7000-8000-000000009102",
  });
  const caller = as(ids.researcher);

  beforeAll(async () => {
    isolated = await createIsolatedTestDatabase(databaseUrl!);
    // The canonical flow ends with a completed, transcribed interview.
    await seedPersistedCanonicalFlow(isolated.db);
    // One single-choice field on the call, so a correction becomes an answer.
    const definition = {
      schemaVersion: 1,
      key: "discovery_channel",
      label: "Discovery channel",
      prompt: "How did you first hear about us?",
      valueType: "single_select",
      options: [
        { key: "podcast", label: "Podcast" },
        { key: "friend", label: "Friend" },
      ],
      required: false,
      evidenceExpected: false,
      attributionSemantic: null,
      completionMode: "any",
    };
    await isolated.db.execute(sql`
      insert into research_fields (id, merchant_id, key, name, status)
      values (${field}, ${ids.merchant}, 'discovery_channel', 'Discovery channel', 'published')`);
    await isolated.db.execute(sql`
      insert into research_field_versions (id, research_field_id, version, definition, status, published_at)
      values (${fieldVersion}, ${field}, 1, ${JSON.stringify(definition)}::jsonb, 'published', now())`);
    await isolated.db.execute(sql`
      insert into research_field_set_items (field_set_version_id, field_version_id, source, required, display_order)
      values (${ids.fieldSetVersion}, ${fieldVersion}, 'research_run', false, 99)`);
    service = new PostgresOperationsApplicationService(
      isolated.db,
      new PrefixedSyntheticPhoneDecryptor(),
    );
  }, 30_000);

  afterAll(async () => isolated?.close());

  it("lists a researcher's own finished calls, and everyone's for managers", async () => {
    const [own] = await service.listCompletedCalls(caller);
    expect(own).toMatchObject({
      interviewId: ids.interview,
      outcome: "completed",
      transcriptLines: 6,
      hasRecording: false,
      mine: true,
    });
    expect(await service.listCompletedCalls(as(teammate))).toEqual([]);
    const [managed] = await service.listCompletedCalls(
      as(teammate, ["research_manager"]),
    );
    expect(managed).toMatchObject({ interviewId: ids.interview, mine: false });
  });

  it("shows the transcript in order with speakers, but not to other researchers", async () => {
    const review = await service.getCallReview(caller, ids.interview);
    expect(review.outcome).toBe("completed");
    expect(review.transcriptStatus).toBe("completed");
    expect(review.transcript.map((line) => line.speaker)).toEqual([
      "researcher",
      "customer",
      "researcher",
      "customer",
      "researcher",
      "customer",
    ]);
    expect(review.transcript[1]?.text).toContain("creator review");
    await expect(
      service.getCallReview(as(teammate), ids.interview),
    ).rejects.toMatchObject({ code: "INTERVIEW_ACCESS_DENIED" });
  });

  it("saves review corrections as human_reviewed, while live saves stay closed", async () => {
    const review = await service.getCallReview(caller, ids.interview);
    const prompt = review.prompts.find(
      (candidate) => candidate.key === `field:${fieldVersion}`,
    );
    expect(prompt?.options).toEqual(["Podcast", "Friend"]);
    const input = {
      covered: true,
      selected: [prompt!.options[0]!],
      note: "Heard on the recording",
    };
    await expect(
      service.savePromptProgress(caller, ids.interview, prompt!.key, input),
    ).rejects.toMatchObject({ code: "INTERVIEW_CLOSED" });

    // A manager can correct a teammate's call.
    await service.reviewPromptProgress(
      as(teammate, ["research_manager"]),
      ids.interview,
      prompt!.key,
      input,
    );
    const updated = await service.getCallReview(caller, ids.interview);
    expect(
      updated.prompts.find((candidate) => candidate.key === prompt!.key),
    ).toMatchObject({ covered: true, note: "Heard on the recording" });
    const [response] = (
      await isolated.db.execute(sql`
        select provenance, provenance_details->>'source' as source, created_by
        from interview_responses
        where interview_id = ${ids.interview}
          and research_field_version_id = ${fieldVersion}
        order by version desc limit 1`)
    ).rows;
    expect(response).toEqual({
      provenance: "human_reviewed",
      source: "call_review",
      created_by: teammate,
    });
  });

  it("hands out the recording key only once it is stored, and audits it", async () => {
    expect(await service.getRecordingObjectKey(caller, ids.interview)).toBe(
      null,
    );
    await isolated.db.execute(sql`
      insert into recordings (id, merchant_id, interview_id, provider, provider_ref, object_key, status, consent_status)
      values (gen_random_uuid(), ${ids.merchant}, ${ids.interview}, 'twilio', ${`RE${"a".repeat(32)}`},
              'recordings/review.mp3', 'stored', 'granted')`);
    expect(await service.getRecordingObjectKey(caller, ids.interview)).toBe(
      "recordings/review.mp3",
    );
    expect(
      (
        await isolated.db.execute(sql`
          select count(*)::int as count from audit_events
          where action = 'recording.playback_authorized' and subject_id = ${ids.interview}`)
      ).rows[0],
    ).toEqual({ count: 1 });
    await expect(
      service.getRecordingObjectKey(as(teammate), ids.interview),
    ).rejects.toMatchObject({ code: "INTERVIEW_ACCESS_DENIED" });
  });
});
