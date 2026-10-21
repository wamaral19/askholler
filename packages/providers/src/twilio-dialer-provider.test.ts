import { describe, expect, it, vi } from "vitest";
import {
  TwilioDialerProvider,
  TwilioProviderError,
} from "./twilio-dialer-provider";

const accountSid = `AC${"a".repeat(32)}`;
const callSid = `CA${"b".repeat(32)}`;
const recordingSid = `RE${"c".repeat(32)}`;

function provider(fetch: typeof globalThis.fetch): TwilioDialerProvider {
  return new TwilioDialerProvider({
    accountSid,
    authToken: "secret",
    fromPhoneE164: "+15555550100",
    callInstructionUrl: "https://app.withholler.com/api/twilio/voice",
    callStatusCallbackUrl: "https://app.withholler.com/api/twilio/status",
    apiBaseUrl: "https://twilio.test",
    fetch,
  });
}

describe("TwilioDialerProvider", () => {
  it("starts a call with callbacks and no Holler metadata or PII in URLs", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url);
        requestedInit = init;
        return Response.json({ sid: callSid, status: "queued" });
      },
    );
    const session = await provider(fetch).startCall({
      merchantId: "merchant",
      interviewId: "interview",
      customerPrivateRef: "private-ref",
      idempotencyKey: "call-1",
      destinationPhoneE164: "+15555550101",
    });
    expect(session).toEqual({
      provider: "twilio",
      providerCallReference: callSid,
      status: "dialing",
    });
    expect(requestedUrl).toBe(
      `https://twilio.test/2010-04-01/Accounts/${accountSid}/Calls.json`,
    );
    const body = requestedInit?.body as URLSearchParams;
    expect(body.get("To")).toBe("+15555550101");
    expect(body.getAll("StatusCallbackEvent")).toEqual([
      "initiated",
      "ringing",
      "answered",
      "completed",
    ]);
    expect(body.toString()).not.toContain("merchant");
  });

  it("starts, stops, downloads, and deletes a dual-channel recording", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "DELETE")
          return new Response(null, { status: 204 });
        if (String(_url).endsWith(".mp3"))
          return new Response(new Uint8Array([1, 2, 3]));
        return Response.json({
          sid: recordingSid,
          call_sid: callSid,
          status: init?.body ? "in-progress" : "completed",
        });
      },
    );
    const dialer = provider(fetch);
    const recording = await dialer.startRecording({
      providerCallReference: callSid,
      idempotencyKey: "record-1",
      statusCallbackUrl:
        "https://app.withholler.com/api/twilio/recording-status",
    });
    expect(recording.status).toBe("in_progress");
    const startBody = fetch.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(startBody.get("RecordingChannels")).toBe("dual");
    await expect(
      dialer.stopRecording(callSid, recordingSid),
    ).resolves.toMatchObject({
      status: "in_progress",
    });
    await expect(dialer.downloadRecording(recordingSid)).resolves.toEqual({
      mediaType: "audio/mpeg",
      bytes: new Uint8Array([1, 2, 3]),
    });
    await expect(dialer.deleteRecording(recordingSid)).resolves.toBeUndefined();
  });

  it("starts live transcription of both legs with labelled tracks", async () => {
    const transcriptionSid = `GT${"d".repeat(32)}`;
    let requestedUrl = "";
    let body: URLSearchParams | undefined;
    const twilio = provider(
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url);
        body = init?.body as URLSearchParams;
        return Response.json({ sid: transcriptionSid, status: "in-progress" });
      }),
    );
    await expect(
      twilio.startTranscription({
        providerCallReference: callSid,
        statusCallbackUrl:
          "https://app.withholler.com/api/twilio/transcription-status",
      }),
    ).resolves.toEqual({ providerTranscriptionReference: transcriptionSid });
    expect(requestedUrl).toBe(
      `https://twilio.test/2010-04-01/Accounts/${accountSid}/Calls/${callSid}/Transcriptions.json`,
    );
    expect(Object.fromEntries(body!)).toMatchObject({
      Track: "both_tracks",
      InboundTrackLabel: "researcher",
      OutboundTrackLabel: "customer",
      PartialResults: "false",
      StatusCallbackUrl:
        "https://app.withholler.com/api/twilio/transcription-status",
    });
    // No Intelligence service or conversation: Twilio keeps no transcript.
    expect(body!.has("IntelligenceService")).toBe(false);
    expect(body!.has("ConversationConfiguration")).toBe(false);
  });

  it("stops live transcription and tolerates one that already ended", async () => {
    const transcriptionSid = `GT${"d".repeat(32)}`;
    let body: URLSearchParams | undefined;
    const stopped = provider(
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        body = init?.body as URLSearchParams;
        return Response.json({ sid: transcriptionSid, status: "stopped" });
      }),
    );
    await stopped.stopTranscription(callSid, transcriptionSid);
    expect(body?.get("Status")).toBe("stopped");
    const gone = provider(
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(
      gone.stopTranscription(callSid, transcriptionSid),
    ).resolves.toBeUndefined();
  });

  it("requires a destination and emits redacted provider errors", async () => {
    const dialer = provider(
      vi.fn(
        async () =>
          new Response("contains sensitive provider detail", { status: 400 }),
      ),
    );
    await expect(
      dialer.startCall({
        merchantId: "merchant",
        interviewId: "interview",
        customerPrivateRef: "private",
        idempotencyKey: "key",
      }),
    ).rejects.toThrow("requires destinationPhoneE164");
    await expect(dialer.getCallStatus(callSid)).rejects.toEqual(
      new TwilioProviderError("get call", 400),
    );
  });
});
