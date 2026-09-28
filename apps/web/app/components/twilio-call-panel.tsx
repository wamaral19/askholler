import { useEffect, useRef, useState } from "react";

import {
  callErrorMessage,
  createTwilioBrowserDevice,
  mayStartRecording,
  type BrowserCall,
  type BrowserDevice,
  type CallPhase,
  type RecordingPhase,
} from "../lib/twilio-browser";

type TokenResponse = {
  token: string;
  params?: Record<string, string>;
};

export function TwilioCallPanel({ interviewId }: { interviewId: string }) {
  const device = useRef<BrowserDevice | null>(null);
  const call = useRef<BrowserCall | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [recordingPhase, setRecordingPhase] =
    useState<RecordingPhase>("not_started");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      call.current?.disconnect();
      device.current?.destroy();
    },
    [],
  );

  async function startCall() {
    setError(null);
    setConsentConfirmed(false);
    setRecordingPhase("not_started");
    setCallPhase("connecting");
    try {
      const response = await fetch(
        `/api/twilio/token?interviewId=${encodeURIComponent(interviewId)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error("Unable to authorize this call");
      const setup = (await response.json()) as TokenResponse;
      const nextDevice = createTwilioBrowserDevice(setup.token);
      device.current = nextDevice;
      const nextCall = await nextDevice.connect({
        params: { interviewId, ...setup.params },
      });
      call.current = nextCall;
      nextCall.on("accept", () => setCallPhase("connected"));
      const ended = () => {
        setCallPhase("ended");
        setRecordingPhase((current) =>
          current === "recording" ? "stopped" : current,
        );
      };
      nextCall.on("disconnect", ended);
      nextCall.on("cancel", ended);
      nextCall.on("reject", ended);
      nextCall.on("error", (cause) => {
        setError(callErrorMessage(cause));
        setCallPhase("error");
      });
    } catch (cause) {
      setError(callErrorMessage(cause));
      setCallPhase("error");
    }
  }

  async function setRecording(action: "start" | "stop") {
    if (action === "start" && !mayStartRecording(callPhase, consentConfirmed))
      return;
    setError(null);
    setRecordingPhase(action === "start" ? "starting" : "stopping");
    try {
      const response = await fetch("/api/twilio/recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId, action }),
      });
      if (!response.ok) throw new Error(`Unable to ${action} recording`);
      setRecordingPhase(action === "start" ? "recording" : "stopped");
    } catch (cause) {
      setError(callErrorMessage(cause));
      setRecordingPhase(action === "start" ? "not_started" : "recording");
    }
  }

  function endCall() {
    setCallPhase("ending");
    call.current?.disconnect();
  }

  const active =
    callPhase === "connecting" ||
    callPhase === "connected" ||
    callPhase === "ending";

  return (
    <section className="twilio-call-panel" aria-label="Call controls">
      <div className="call-status" aria-live="polite">
        <span
          className={callPhase === "connected" ? "pulse-dot" : "status-dot"}
        />
        <strong>{callPhase.replaceAll("_", " ")}</strong>
        {recordingPhase === "recording" ? (
          <span className="recording-badge">Recording</span>
        ) : null}
      </div>

      {!active ? (
        <button
          className="button button-primary button-full"
          onClick={startCall}
          type="button"
        >
          Start call
        </button>
      ) : (
        <button
          className="button button-quiet button-full"
          disabled={callPhase === "ending"}
          onClick={endCall}
          type="button"
        >
          End call
        </button>
      )}

      {callPhase === "connected" && recordingPhase !== "recording" ? (
        <div className="consent-controls">
          <p>
            Ask: “I’d like to record this call for customer research. Is that
            okay?”
          </p>
          <label>
            <input
              checked={consentConfirmed}
              onChange={(event) => setConsentConfirmed(event.target.checked)}
              type="checkbox"
            />
            Customer explicitly said yes
          </label>
          <button
            className="button button-primary button-full"
            disabled={
              !mayStartRecording(callPhase, consentConfirmed) ||
              recordingPhase === "starting"
            }
            onClick={() => setRecording("start")}
            type="button"
          >
            {recordingPhase === "starting"
              ? "Starting recording…"
              : "Start recording"}
          </button>
        </div>
      ) : null}

      {recordingPhase === "recording" ? (
        <button
          className="button button-quiet button-full"
          onClick={() => setRecording("stop")}
          type="button"
        >
          Stop recording
        </button>
      ) : null}

      {error ? (
        <p className="call-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
