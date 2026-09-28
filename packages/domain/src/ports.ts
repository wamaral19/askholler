import type { CallStatus } from "./states";

export interface StartCallInput {
  readonly merchantId: string;
  readonly interviewId: string;
  readonly customerPrivateRef: string;
  readonly idempotencyKey: string;
  /**
   * Decrypted only at the telephony boundary. Callers must never persist or log
   * this value. Fake providers may omit it; production dialers must require it.
   */
  readonly destinationPhoneE164?: string;
}

export interface CallSession {
  readonly provider: string;
  readonly providerCallReference: string;
  readonly status: CallStatus;
}

export interface StartRecordingInput {
  readonly providerCallReference: string;
  /** An opaque Holler correlation value; never include customer PII. */
  readonly idempotencyKey: string;
  readonly statusCallbackUrl?: string;
}

export interface RecordingSession {
  readonly provider: string;
  readonly providerRecordingReference: string;
  readonly providerCallReference: string;
  readonly status: "in_progress" | "completed" | "failed";
}

export interface RecordingMedia {
  readonly mediaType: "audio/mpeg" | "audio/wav";
  readonly bytes: Uint8Array;
}

export interface DialerProvider {
  startCall(input: StartCallInput): Promise<CallSession>;
  endCall(providerCallReference: string): Promise<void>;
  getCallStatus(providerCallReference: string): Promise<CallStatus>;
  startRecording(input: StartRecordingInput): Promise<RecordingSession>;
  stopRecording(
    providerCallReference: string,
    providerRecordingReference: string,
  ): Promise<RecordingSession>;
  getRecording(providerRecordingReference: string): Promise<RecordingSession>;
  downloadRecording(
    providerRecordingReference: string,
  ): Promise<RecordingMedia>;
  deleteRecording(providerRecordingReference: string): Promise<void>;
}

export interface TranscriptSegmentInput {
  readonly sequence: number;
  readonly speaker: "researcher" | "customer" | "unknown";
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly text: string;
}

export interface TranscriptionProvider {
  submitRecording(input: {
    recordingRef: string;
    idempotencyKey: string;
  }): Promise<{ providerJobRef: string }>;
  getTranscript(
    providerJobRef: string,
  ): Promise<readonly TranscriptSegmentInput[]>;
}

export interface JobDispatcher {
  enqueue(input: {
    jobType: string;
    idempotencyKey: string;
    payload: Readonly<Record<string, string | number | boolean | null>>;
  }): Promise<void>;
}

export interface CustomerPrivateRevealRequest {
  readonly merchantId: string;
  readonly assignmentId: string;
  readonly customerId: string;
  readonly researcherId: string;
  readonly purpose: "manual_dial";
  readonly correlationId: string;
}

export interface CustomerPrivateRevealResult {
  readonly phoneE164: string;
  readonly expiresAt: Date;
}

/**
 * Purpose-specific PII boundary. Implementations must authorize the active
 * assignment claim and audit both allowed and denied access without including
 * the revealed value in audit metadata.
 */
export interface CustomerPrivateService {
  revealPhoneForClaimedAssignment(
    request: CustomerPrivateRevealRequest,
  ): Promise<CustomerPrivateRevealResult>;
}

export interface PrivateObjectStore {
  put(input: {
    key: string;
    mediaType: string;
    bytes: Uint8Array;
  }): Promise<{ checksum: string }>;
  delete(key: string): Promise<void>;
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
}
