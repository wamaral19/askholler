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
