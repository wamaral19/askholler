import { Call, Device } from "@twilio/voice-sdk";

export type CallPhase =
  "idle" | "connecting" | "connected" | "ending" | "ended" | "error";

export type RecordingPhase =
  "not_started" | "starting" | "recording" | "stopping" | "stopped";

export interface BrowserCall {
  disconnect(): void;
  on(
    event: "accept" | "disconnect" | "cancel" | "reject" | "error",
    listener: (error?: Error) => void,
  ): void;
}

export interface BrowserDevice {
  connect(options: { params: Record<string, string> }): Promise<BrowserCall>;
  destroy(): void;
}

export function createTwilioBrowserDevice(token: string): BrowserDevice {
  return new Device(token, {
    codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    closeProtection: true,
  }) as unknown as BrowserDevice;
}

export function mayStartRecording(
  callPhase: CallPhase,
  consentConfirmed: boolean,
) {
  return callPhase === "connected" && consentConfirmed;
}

export function callErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    [
      "Unable to authorize this call",
      "Unable to start recording",
      "Unable to stop recording",
    ].includes(error.message)
  )
    return error.message;
  return "The call could not be completed. Please try again.";
}
