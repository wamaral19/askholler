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
  PostgresTwilioCallStore,
  PostgresTwilioTranscriptStore,
} from "./twilio-server.server";

const databaseUrl = testDatabaseUrl();
const callSid = `CA${"a".repeat(32)}`;
const transcriptionSid = `GT${"b".repeat(32)}`;

describe.skipIf(databaseUrl === undefined)(
  "Twilio live transcript store",
  () => {
    let isolated: IsolatedTestDatabase;
    let store: PostgresTwilioTranscriptStore;
    let transcriptId: string;
    const context = {
      merchantId: ids.merchant,
      merchantIds: [ids.merchant],
      researcherId: ids.researcher,
      roles: ["researcher"],
      correlationId: "00000000-0000-7000-8000-000000009001",
    } as TenantContext;
    const segments = async () =>
      (
        await isolated.db.execute(sql`
        select s.sequence, s.speaker, s.text, s.end_ms is not null as timed
        from transcript_segments s join transcripts t on t.id = s.transcript_id
        where t.id = ${transcriptId} order by s.sequence`)
      ).rows;

    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(databaseUrl!);
      await seedPersistedCanonicalFlow(isolated.db);
      // Turn the seeded manual call into the Twilio call being transcribed.
      await isolated.db.execute(sql`
      update calls set provider = 'twilio', provider_call_ref = ${callSid}
      where interview_id = ${ids.interview}`);
      store = new PostgresTwilioTranscriptStore(isolated.db);
    }, 30_000);

    afterAll(async () => isolated?.close());

    // The database's call status check once rejected "authorized", so the
    // first Start call click failed; exercise reserve-then-bind for real.
    it("reserves a call intent and binds Twilio's Call SID", async () => {
      const calls = new PostgresTwilioCallStore(isolated.db);
      const claims = {
        merchantId: ids.merchant,
        interviewId: ids.interview,
        assignmentId: ids.assignment,
        researcherId: ids.researcher,
        nonce: "00000000-0000-7000-8000-000000009003",
        expiresAt: Date.now() + 60_000,
      };
      await calls.reserveIntent(claims);
      expect(await calls.bindIntent(claims, callSid)).toBe(true);
      const [row] = (
        await isolated.db.execute(sql`
        select provider, provider_call_ref, status from calls
        where interview_id = ${ids.interview}`)
      ).rows;
      expect(row).toEqual({
        provider: "twilio",
        provider_call_ref: callSid,
        status: "dialing",
      });
    });

    it("creates one transcript per interview and refuses a second session", async () => {
      transcriptId = (await store.beginTranscript(
        ids.merchant,
        ids.interview,
      ))!;
      expect(transcriptId).toBeTruthy();
      // Not started yet, so a retry may reuse it.
      expect(await store.beginTranscript(ids.merchant, ids.interview)).toBe(
        transcriptId,
      );
      await store.setTranscriptReference(transcriptId, transcriptionSid);
      expect(
        await store.beginTranscript(ids.merchant, ids.interview),
      ).toBeNull();
      expect(
        await store.getActiveTranscription(context, ids.interview),
      ).toEqual({ callSid, transcriptionSid });
    });

    it("stores utterances idempotently and in sequence order", async () => {
      const event = (sequence: number, speaker: "researcher" | "customer") => ({
        callSid,
        transcriptionSid,
        kind: "content" as const,
        sequence,
        speaker,
        text: `utterance ${sequence}`,
        occurredAt: new Date(Date.now() + 1000),
      });
      expect(await store.recordTranscriptionEvent(event(4, "customer"))).toBe(
        true,
      );
      expect(await store.recordTranscriptionEvent(event(2, "researcher"))).toBe(
        true,
      );
      // Twilio retry of the same utterance.
      expect(await store.recordTranscriptionEvent(event(4, "customer"))).toBe(
        true,
      );
      expect(await segments()).toEqual([
        {
          sequence: 2,
          speaker: "researcher",
          text: "utterance 2",
          timed: true,
        },
        { sequence: 4, speaker: "customer", text: "utterance 4", timed: true },
      ]);
    });

    it("ignores callbacks for another transcription or call", async () => {
      expect(
        await store.recordTranscriptionEvent({
          callSid,
          transcriptionSid: `GT${"c".repeat(32)}`,
          kind: "stopped",
        }),
      ).toBe(false);
      expect(
        await store.recordTranscriptionEvent({
          callSid: `CA${"d".repeat(32)}`,
          transcriptionSid,
          kind: "stopped",
        }),
      ).toBe(false);
    });

    it("completes the transcript when Twilio stops the session", async () => {
      await store.recordTranscriptionEvent({
        callSid,
        transcriptionSid,
        kind: "stopped",
      });
      const [row] = (
        await isolated.db.execute(sql`
        select status, completed_at is not null as completed
        from transcripts where id = ${transcriptId}`)
      ).rows;
      expect(row).toEqual({ status: "completed", completed: true });
      const [interview] = (
        await isolated.db.execute(sql`
        select transcript_status from interviews where id = ${ids.interview}`)
      ).rows;
      expect(interview).toEqual({ transcript_status: "ready" });
      expect(
        await store.getActiveTranscription(context, ids.interview),
      ).toBeNull();
    });

    it("does not reveal another researcher's transcription", async () => {
      await isolated.db.execute(sql`
      update transcripts set status = 'processing' where id = ${transcriptId}`);
      expect(
        await store.getActiveTranscription(
          { ...context, researcherId: "00000000-0000-7000-8000-000000009002" },
          ids.interview,
        ),
      ).toBeNull();
    });
  },
);
