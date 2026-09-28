import type {
  CallSession,
  CallStatus,
  DialerProvider,
  RecordingMedia,
  RecordingSession,
  StartCallInput,
  StartRecordingInput,
} from "@holler/domain";

const PROVIDER_NAME = "twilio";
const SID_PATTERN = /^[A-Z]{2}[a-fA-F0-9]{32}$/;
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export interface TwilioDialerConfig {
  readonly accountSid: string;
  readonly authToken: string;
  readonly fromPhoneE164: string;
  /** TwiML URL used to connect a server-created outbound call. */
  readonly callInstructionUrl: string;
  readonly callStatusCallbackUrl?: string;
  readonly apiBaseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

interface TwilioCallResponse {
  readonly sid: string;
  readonly status: string;
}

interface TwilioRecordingResponse {
  readonly sid: string;
  readonly call_sid: string;
  readonly status: string;
}

export class TwilioProviderError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super(`Twilio ${operation} failed with HTTP ${status}`);
    this.name = "TwilioProviderError";
  }
}

/**
 * Twilio's REST adapter. It intentionally accepts the destination only at this
 * boundary and never includes phone numbers or response bodies in errors.
 */
export class TwilioDialerProvider implements DialerProvider {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly apiBaseUrl: string;
  private readonly authorization: string;

  constructor(private readonly config: TwilioDialerConfig) {
    assertSid(config.accountSid, "accountSid", "AC");
    assertE164(config.fromPhoneE164, "fromPhoneE164");
    assertHttpsUrl(config.callInstructionUrl, "callInstructionUrl");
    if (config.callStatusCallbackUrl !== undefined) {
      assertHttpsUrl(config.callStatusCallbackUrl, "callStatusCallbackUrl");
    }
    if (config.authToken.length === 0) throw new Error("authToken is required");
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.apiBaseUrl = (config.apiBaseUrl ?? "https://api.twilio.com").replace(
      /\/$/,
      "",
    );
    this.authorization = `Basic ${encodeBase64(`${config.accountSid}:${config.authToken}`)}`;
  }

  async startCall(input: StartCallInput): Promise<CallSession> {
    if (input.destinationPhoneE164 === undefined) {
      throw new Error("Twilio startCall requires destinationPhoneE164");
    }
    assertE164(input.destinationPhoneE164, "destinationPhoneE164");
    const form = new URLSearchParams({
      To: input.destinationPhoneE164,
      From: this.config.fromPhoneE164,
      Url: this.config.callInstructionUrl,
      Method: "POST",
    });
    if (this.config.callStatusCallbackUrl !== undefined) {
      form.set("StatusCallback", this.config.callStatusCallbackUrl);
      form.set("StatusCallbackMethod", "POST");
      for (const event of ["initiated", "ringing", "answered", "completed"]) {
        form.append("StatusCallbackEvent", event);
      }
    }
    const response = await this.requestJson<TwilioCallResponse>(
      "start call",
      `/2010-04-01/Accounts/${this.config.accountSid}/Calls.json`,
      { method: "POST", body: form },
    );
    return toCallSession(response);
  }

  async endCall(providerCallReference: string): Promise<void> {
    assertSid(providerCallReference, "providerCallReference", "CA");
    await this.requestJson<TwilioCallResponse>(
      "end call",
      `/2010-04-01/Accounts/${this.config.accountSid}/Calls/${providerCallReference}.json`,
      { method: "POST", body: new URLSearchParams({ Status: "completed" }) },
    );
  }

  async getCallStatus(providerCallReference: string): Promise<CallStatus> {
    assertSid(providerCallReference, "providerCallReference", "CA");
    const response = await this.requestJson<TwilioCallResponse>(
      "get call",
      `/2010-04-01/Accounts/${this.config.accountSid}/Calls/${providerCallReference}.json`,
    );
    return mapCallStatus(response.status);
  }

  async startRecording(input: StartRecordingInput): Promise<RecordingSession> {
    assertSid(input.providerCallReference, "providerCallReference", "CA");
    const form = new URLSearchParams({
      RecordingChannels: "dual",
      Trim: "do-not-trim",
    });
    if (input.statusCallbackUrl !== undefined) {
      assertHttpsUrl(input.statusCallbackUrl, "statusCallbackUrl");
      form.set("RecordingStatusCallback", input.statusCallbackUrl);
      form.set("RecordingStatusCallbackMethod", "POST");
      form.append("RecordingStatusCallbackEvent", "completed");
      form.append("RecordingStatusCallbackEvent", "absent");
    }
    const response = await this.requestJson<TwilioRecordingResponse>(
      "start recording",
      `/2010-04-01/Accounts/${this.config.accountSid}/Calls/${input.providerCallReference}/Recordings.json`,
      { method: "POST", body: form },
    );
    return toRecordingSession(response);
  }

  async stopRecording(
    providerCallReference: string,
    providerRecordingReference: string,
  ): Promise<RecordingSession> {
    assertSid(providerCallReference, "providerCallReference", "CA");
    assertSid(providerRecordingReference, "providerRecordingReference", "RE");
    const response = await this.requestJson<TwilioRecordingResponse>(
      "stop recording",
      `/2010-04-01/Accounts/${this.config.accountSid}/Calls/${providerCallReference}/Recordings/${providerRecordingReference}.json`,
      { method: "POST", body: new URLSearchParams({ Status: "stopped" }) },
    );
    return toRecordingSession(response);
  }

  async getRecording(
    providerRecordingReference: string,
  ): Promise<RecordingSession> {
    assertSid(providerRecordingReference, "providerRecordingReference", "RE");
    const response = await this.requestJson<TwilioRecordingResponse>(
      "get recording",
      `/2010-04-01/Accounts/${this.config.accountSid}/Recordings/${providerRecordingReference}.json`,
    );
    return toRecordingSession(response);
  }

  async downloadRecording(
    providerRecordingReference: string,
  ): Promise<RecordingMedia> {
    assertSid(providerRecordingReference, "providerRecordingReference", "RE");
    const response = await this.request(
      "download recording",
      `/2010-04-01/Accounts/${this.config.accountSid}/Recordings/${providerRecordingReference}.mp3`,
    );
    return {
      mediaType: "audio/mpeg",
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  }

  async deleteRecording(providerRecordingReference: string): Promise<void> {
    assertSid(providerRecordingReference, "providerRecordingReference", "RE");
    try {
      await this.request(
        "delete recording",
        `/2010-04-01/Accounts/${this.config.accountSid}/Recordings/${providerRecordingReference}.json`,
        { method: "DELETE" },
      );
    } catch (error) {
      // Provider deletion is idempotent so a callback retry can finish after a
      // prior delete succeeded but the local completion update did not.
      if (error instanceof TwilioProviderError && error.status === 404) return;
      throw error;
    }
  }

  private async requestJson<T>(
    operation: string,
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    return (await (await this.request(operation, path, init)).json()) as T;
  }

  private async request(
    operation: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.authorization);
    if (init.body instanceof URLSearchParams) {
      headers.set(
        "Content-Type",
        "application/x-www-form-urlencoded;charset=UTF-8",
      );
    }
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) throw new TwilioProviderError(operation, response.status);
    return response;
  }
}

function toCallSession(response: TwilioCallResponse): CallSession {
  return {
    provider: PROVIDER_NAME,
    providerCallReference: response.sid,
    status: mapCallStatus(response.status),
  };
}

function toRecordingSession(
  response: TwilioRecordingResponse,
): RecordingSession {
  return {
    provider: PROVIDER_NAME,
    providerRecordingReference: response.sid,
    providerCallReference: response.call_sid,
    status: mapRecordingStatus(response.status),
  };
}

export function mapTwilioCallStatus(status: string): CallStatus {
  return mapCallStatus(status);
}

function mapCallStatus(status: string): CallStatus {
  switch (status) {
    case "queued":
    case "initiated":
      return "dialing";
    case "ringing":
      return "ringing";
    case "in-progress":
      return "answered";
    case "completed":
    case "canceled":
      return "completed";
    case "no-answer":
    case "busy":
      return "no_answer";
    default:
      return "failed";
  }
}

function mapRecordingStatus(status: string): RecordingSession["status"] {
  if (status === "in-progress" || status === "processing") return "in_progress";
  if (status === "completed" || status === "stopped") return "completed";
  return "failed";
}

function assertSid(value: string, field: string, prefix: string): void {
  if (!SID_PATTERN.test(value) || !value.startsWith(prefix))
    throw new Error(`${field} is invalid`);
}

function assertE164(value: string, field: string): void {
  if (!E164_PATTERN.test(value)) throw new Error(`${field} must be E.164`);
}

function assertHttpsUrl(value: string, field: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${field} must use HTTPS`);
}

function encodeBase64(value: string): string {
  return btoa(value);
}
