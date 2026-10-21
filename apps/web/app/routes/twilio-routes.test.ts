import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperationsApplicationService } from "../lib/operations-types";
import {
  configureOperationsService,
  configureWorkforceContextResolver,
  resetOperationsCompositionForTests,
} from "../lib/operations-service.server";
import {
  configureTwilioServerForTests,
  createCallIntent,
  type TwilioCallStore,
  type TwilioServerDependencies,
  type TwilioTranscriptStore,
} from "../lib/twilio-server.server";
import { SyntheticWorkforceContextResolver } from "../lib/workforce-session.server";
import { action as recordingAction } from "./twilio-recording";
import { action as transcriptionStatusAction } from "./twilio-transcription-status";
import { loader as tokenLoader } from "./twilio-token";
import { action as voiceAction } from "./twilio-voice";

const merchantId = "00000000-0000-7000-8000-000000002001";
const researcherId = "00000000-0000-7000-8000-000000002002";
const interviewId = "00000000-0000-7000-8000-000000002003";
const assignmentId = "00000000-0000-7000-8000-000000002004";
const callSid = `CA${"a".repeat(32)}`;
const recordingSid = `RE${"b".repeat(32)}`;
const transcriptionSid = `GT${"c".repeat(32)}`;

function setup() {
  const store: TwilioCallStore = {
    reserveIntent: vi.fn(async () => undefined),
    bindIntent: vi.fn(async () => true),
    grantConsentAndGetCall: vi.fn(async () => callSid),
    getRecordingForCall: vi.fn(async () => ({ callSid, recordingSid })),
    saveRecording: vi.fn(async () => undefined),
    updateCall: vi.fn(async () => undefined),
    updateRecording: vi.fn(async () => undefined),
  };
  const deps: TwilioServerDependencies = {
    store,
    dialer: {
      startRecording: vi.fn(async () => ({
        provider: "twilio",
        providerCallReference: callSid,
        providerRecordingReference: recordingSid,
        status: "in_progress" as const,
      })),
      stopRecording: vi.fn(async () => ({
        provider: "twilio",
        providerCallReference: callSid,
        providerRecordingReference: recordingSid,
        status: "completed" as const,
      })),
    },
    createVoiceToken: vi.fn(async () => "voice-token"),
    authToken: "auth-secret",
    callerId: "+12025550100",
    appBaseUrl: "https://holler.example",
    intentSecret: "intent-secret-long-enough",
    now: () => 1_000_000,
  };
  const workspace = {
    id: interviewId,
    assignment: { id: assignmentId },
    scriptName: "Test",
    scriptVersion: 1,
    fieldSetVersion: 1,
    script: [],
    fields: [],
    answeredFieldIds: [],
    status: "dialing",
  };
  configureOperationsService({
    getInterview: vi.fn(async () => workspace),
    revealPhone: vi.fn(async () => ({ phone: "+12025550123" })),
  } as unknown as OperationsApplicationService);
  configureWorkforceContextResolver(
    new SyntheticWorkforceContextResolver(
      new Map([
        [
          "test-session",
          { merchantId, researcherId, enabled: true, roles: ["researcher"] },
        ],
      ]),
    ),
  );
  configureTwilioServerForTests(deps);
  return { deps, store };
}

function withTranscription(deps: TwilioServerDependencies) {
  const transcripts: TwilioTranscriptStore = {
    beginTranscript: vi.fn(async () => "transcript-1"),
    setTranscriptReference: vi.fn(async () => undefined),
    getActiveTranscription: vi.fn(async () => ({ callSid, transcriptionSid })),
    recordTranscriptionEvent: vi.fn(async () => true),
  };
  const transcriber = {
    startTranscription: vi.fn(async () => ({
      providerTranscriptionReference: transcriptionSid,
    })),
    stopTranscription: vi.fn(async () => undefined),
  };
  deps.transcription = { store: transcripts, dialer: transcriber };
  return { transcripts, transcriber };
}

async function transcriptionCallback(
  deps: TwilioServerDependencies,
  fields: Record<string, string>,
  signed = true,
) {
  const form = new URLSearchParams({
    CallSid: callSid,
    TranscriptionSid: transcriptionSid,
    ...fields,
  });
  const url = "https://holler.example/api/twilio/transcription-status";
  return transcriptionStatusAction({
    request: new Request(url, {
      method: "POST",
      headers: signed
        ? {
            "x-twilio-signature": await twilioSignature(
              url,
              form,
              deps.authToken,
            ),
          }
        : {},
      body: form,
    }),
  });
}

afterEach(() => {
  configureTwilioServerForTests(undefined);
  resetOperationsCompositionForTests();
});

describe("Twilio server routes", () => {
  it("authorizes the interview and returns only an opaque signed intent", async () => {
    const { store } = setup();
    const response = await tokenLoader({
      request: workforceRequest(
        `https://holler.example/api/twilio/token?interviewId=${interviewId}`,
      ),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      token: string;
      params: Record<string, string>;
    };
    expect(body.token).toBe("voice-token");
    expect(body.params.intent).not.toContain(interviewId);
    expect(store.reserveIntent).toHaveBeenCalledOnce();
  });

  it("rejects an unsigned voice webhook before binding a call", async () => {
    const { store } = setup();
    const response = await voiceAction({
      request: new Request("https://holler.example/api/twilio/voice", {
        method: "POST",
        body: new URLSearchParams({ CallSid: callSid, intent: "untrusted" }),
      }),
    });
    expect(response.status).toBe(403);
    expect(store.bindIntent).not.toHaveBeenCalled();
  });

  it("persists consent before asking Twilio to record", async () => {
    const { deps, store } = setup();
    const response = await recordingAction({
      request: workforceRequest("https://holler.example/api/twilio/recording", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewId, action: "start" }),
      }),
    });
    expect(response.status).toBe(200);
    expect(store.grantConsentAndGetCall).toHaveBeenCalled();
    expect(deps.dialer.startRecording).toHaveBeenCalledWith(
      expect.objectContaining({ providerCallReference: callSid }),
    );
    expect(store.saveRecording).toHaveBeenCalledWith(
      expect.objectContaining({ recordingSid, interviewId, merchantId }),
    );
  });

  it("starts live transcription only after consent starts the recording", async () => {
    const { deps, store } = setup();
    const { transcripts, transcriber } = withTranscription(deps);
    const response = await recordingAction({
      request: workforceRequest("https://holler.example/api/twilio/recording", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewId, action: "start" }),
      }),
    });
    expect(response.status).toBe(200);
    expect(transcripts.beginTranscript).toHaveBeenCalledWith(
      merchantId,
      interviewId,
    );
    expect(transcriber.startTranscription).toHaveBeenCalledWith({
      providerCallReference: callSid,
      statusCallbackUrl:
        "https://holler.example/api/twilio/transcription-status",
    });
    expect(transcripts.setTranscriptReference).toHaveBeenCalledWith(
      "transcript-1",
      transcriptionSid,
    );
    const consentOrder = vi.mocked(store.grantConsentAndGetCall).mock
      .invocationCallOrder[0]!;
    expect(
      vi.mocked(transcriber.startTranscription).mock.invocationCallOrder[0],
    ).toBeGreaterThan(consentOrder);
  });

  it("keeps recording when live transcription fails to start", async () => {
    const { deps, store } = setup();
    const { transcriber, transcripts } = withTranscription(deps);
    vi.mocked(transcriber.startTranscription).mockRejectedValueOnce(
      new Error("twilio down"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await recordingAction({
      request: workforceRequest("https://holler.example/api/twilio/recording", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewId, action: "start" }),
      }),
    });
    expect(response.status).toBe(200);
    expect(store.saveRecording).toHaveBeenCalled();
    expect(transcripts.setTranscriptReference).not.toHaveBeenCalled();
  });

  it("stops live transcription when the recording stops", async () => {
    const { deps } = setup();
    const { transcriber } = withTranscription(deps);
    const response = await recordingAction({
      request: workforceRequest("https://holler.example/api/twilio/recording", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewId, action: "stop" }),
      }),
    });
    expect(response.status).toBe(200);
    expect(transcriber.stopTranscription).toHaveBeenCalledWith(
      callSid,
      transcriptionSid,
    );
  });

  it("stores final utterances with the speaker taken from the track", async () => {
    const { deps } = setup();
    const { transcripts } = withTranscription(deps);
    for (const [track, speaker] of [
      ["inbound_track", "researcher"],
      ["outbound_track", "customer"],
    ] as const) {
      const response = await transcriptionCallback(deps, {
        TranscriptionEvent: "transcription-content",
        Final: "true",
        SequenceId: "3",
        Track: track,
        Timestamp: "2026-10-15T18:45:12.135Z",
        TranscriptionData: JSON.stringify({
          transcript: " I heard about you on a podcast. ",
          confidence: 0.98,
        }),
      });
      expect(response.status).toBe(204);
      expect(transcripts.recordTranscriptionEvent).toHaveBeenLastCalledWith({
        callSid,
        transcriptionSid,
        kind: "content",
        sequence: 3,
        speaker,
        text: "I heard about you on a podcast.",
        occurredAt: new Date("2026-10-15T18:45:12.135Z"),
      });
    }
  });

  it("ignores partial utterances and records the end of the session", async () => {
    const { deps } = setup();
    const { transcripts } = withTranscription(deps);
    await transcriptionCallback(deps, {
      TranscriptionEvent: "transcription-content",
      Final: "false",
      SequenceId: "2",
      Track: "inbound_track",
      TranscriptionData: JSON.stringify({ transcript: "I heard" }),
    });
    expect(transcripts.recordTranscriptionEvent).not.toHaveBeenCalled();
    await transcriptionCallback(deps, {
      TranscriptionEvent: "transcription-stopped",
    });
    expect(transcripts.recordTranscriptionEvent).toHaveBeenCalledWith({
      callSid,
      transcriptionSid,
      kind: "stopped",
    });
  });

  it("rejects unsigned transcription callbacks and unknown sessions", async () => {
    const { deps } = setup();
    const { transcripts } = withTranscription(deps);
    const content = {
      TranscriptionEvent: "transcription-content",
      Final: "true",
      SequenceId: "1",
      Track: "outbound_track",
      TranscriptionData: JSON.stringify({ transcript: "hello" }),
    };
    expect((await transcriptionCallback(deps, content, false)).status).toBe(
      403,
    );
    expect(transcripts.recordTranscriptionEvent).not.toHaveBeenCalled();
    vi.mocked(transcripts.recordTranscriptionEvent).mockResolvedValueOnce(
      false,
    );
    expect((await transcriptionCallback(deps, content)).status).toBe(404);
  });

  it("consumes a signed short-lived intent and ignores a raw browser interviewId", async () => {
    const { deps, store } = setup();
    const intent = await createCallIntent(deps, {
      merchantId,
      interviewId,
      assignmentId,
      researcherId,
    });
    const form = new URLSearchParams({
      CallSid: callSid,
      intent,
      interviewId: "attacker-controlled",
    });
    const url = "https://holler.example/api/twilio/voice";
    const signature = await twilioSignature(url, form, deps.authToken);
    const response = await voiceAction({
      request: new Request(url, {
        method: "POST",
        headers: { "x-twilio-signature": signature },
        body: form,
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("+12025550123");
    expect(store.bindIntent).toHaveBeenCalledWith(
      expect.objectContaining({ interviewId }),
      callSid,
    );
  });
});

function workforceRequest(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-holler-workforce-session", "test-session");
  return new Request(url, { ...init, headers });
}
async function twilioSignature(
  url: string,
  form: URLSearchParams,
  secret: string,
): Promise<string> {
  const canonical = [...form.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(url + canonical),
    ),
  ).toString("base64");
}
