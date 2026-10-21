import {
  getTwilioServerDependencies,
  verifyTwilioRequest,
  type TranscriptionEvent,
} from "../lib/twilio-server.server";

const CALL_SID = /^CA[a-fA-F0-9]{32}$/;
const TRANSCRIPTION_SID = /^GT[a-fA-F0-9]{32}$/;

/** Real-time transcription callbacks; only final utterances are stored. */
export async function action({ request }: { request: Request }) {
  const deps = getTwilioServerDependencies();
  const form = new URLSearchParams(await request.text());
  if (!(await verifyTwilioRequest(request, form, deps)))
    return new Response("Forbidden", { status: 403 });
  if (!deps.transcription) return new Response(null, { status: 204 });
  const callSid = form.get("CallSid") ?? "";
  const transcriptionSid = form.get("TranscriptionSid") ?? "";
  if (!CALL_SID.test(callSid) || !TRANSCRIPTION_SID.test(transcriptionSid))
    return new Response("Bad Request", { status: 400 });

  const event = toEvent(form, callSid, transcriptionSid);
  if (event === "ignore") return new Response(null, { status: 204 });
  if (!event) return new Response("Bad Request", { status: 400 });
  // Twilio retries non-2xx, which covers a callback that beats our reference.
  if (!(await deps.transcription.store.recordTranscriptionEvent(event)))
    return new Response("Not Found", { status: 404 });
  return new Response(null, { status: 204 });
}

function toEvent(
  form: URLSearchParams,
  callSid: string,
  transcriptionSid: string,
): TranscriptionEvent | "ignore" | undefined {
  switch (form.get("TranscriptionEvent")) {
    case "transcription-content": {
      if (form.get("Final") !== "true") return "ignore";
      const sequence = Number(form.get("SequenceId"));
      let text: unknown;
      try {
        text = (
          JSON.parse(form.get("TranscriptionData") ?? "") as {
            transcript?: unknown;
          }
        ).transcript;
      } catch {
        return undefined;
      }
      if (!Number.isInteger(sequence) || sequence < 0) return undefined;
      if (typeof text !== "string" || text.trim() === "") return "ignore";
      const track = form.get("Track");
      const timestamp = new Date(form.get("Timestamp") ?? "");
      return {
        callSid,
        transcriptionSid,
        kind: "content",
        sequence,
        // The researcher's browser call is inbound to Twilio, so its
        // inbound track is the researcher and outbound is the customer.
        speaker:
          track === "inbound_track"
            ? "researcher"
            : track === "outbound_track"
              ? "customer"
              : "unknown",
        text: text.trim(),
        occurredAt: Number.isNaN(timestamp.getTime()) ? undefined : timestamp,
      };
    }
    case "transcription-stopped":
      return { callSid, transcriptionSid, kind: "stopped" };
    case "transcription-error":
      return { callSid, transcriptionSid, kind: "error" };
    default:
      return "ignore";
  }
}
