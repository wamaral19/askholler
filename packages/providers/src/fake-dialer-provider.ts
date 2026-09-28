import type {
  CallSession,
  CallStatus,
  DialerProvider,
  RecordingMedia,
  RecordingSession,
  StartRecordingInput,
  StartCallInput,
} from "@holler/domain";
import {
  FakeDialerTransitionError,
  FakeProviderIdempotencyConflictError,
  FakeProviderNotFoundError,
} from "./fake-provider-errors";
import { stableFakeReference } from "./stable-reference";

const PROVIDER_NAME = "fake_dialer";

const allowedTransitions: Readonly<Record<CallStatus, readonly CallStatus[]>> =
  {
    created: ["manual_dial_ready"],
    manual_dial_ready: ["dialing", "answered", "no_answer", "failed"],
    dialing: ["ringing", "answered", "no_answer", "failed"],
    ringing: ["answered", "no_answer", "failed"],
    answered: ["completed", "failed"],
    completed: [],
    no_answer: [],
    failed: [],
  };

interface StoredCall {
  readonly input: StartCallInput;
  readonly providerCallReference: string;
  status: CallStatus;
}

interface StoredRecording {
  readonly providerRecordingReference: string;
  readonly providerCallReference: string;
  status: RecordingSession["status"];
}

/**
 * A deterministic in-memory dialer for development and tests.
 *
 * Starting a call only makes the manual dial action ready. Tests or demo
 * orchestration must explicitly simulate the subsequent lifecycle, preserving
 * the product requirement that qualification never auto-dials a customer.
 */
export class FakeDialerProvider implements DialerProvider {
  private readonly callsByIdempotencyKey = new Map<string, StoredCall>();
  private readonly callsByReference = new Map<string, StoredCall>();
  private readonly recordingsByReference = new Map<string, StoredRecording>();
  private readonly recordingsByIdempotencyKey = new Map<
    string,
    StoredRecording
  >();

  get callCount(): number {
    return this.callsByReference.size;
  }

  async startCall(input: StartCallInput): Promise<CallSession> {
    const existing = this.callsByIdempotencyKey.get(input.idempotencyKey);
    if (existing !== undefined) {
      if (!sameStartCallInput(existing.input, input)) {
        throw new FakeProviderIdempotencyConflictError("startCall");
      }

      return toSession(existing);
    }

    const call: StoredCall = {
      input: { ...input },
      providerCallReference: stableFakeReference("call", input.idempotencyKey),
      status: "manual_dial_ready",
    };

    this.callsByIdempotencyKey.set(input.idempotencyKey, call);
    this.callsByReference.set(call.providerCallReference, call);
    return toSession(call);
  }

  async getCallStatus(providerCallReference: string): Promise<CallStatus> {
    return this.requireCall(providerCallReference).status;
  }

  async endCall(providerCallReference: string): Promise<void> {
    const call = this.requireCall(providerCallReference);
    if (
      call.status === "completed" ||
      call.status === "no_answer" ||
      call.status === "failed"
    ) {
      return;
    }

    this.transition(call, "completed");
  }

  async startRecording(input: StartRecordingInput): Promise<RecordingSession> {
    this.requireCall(input.providerCallReference);
    const existing = this.recordingsByIdempotencyKey.get(input.idempotencyKey);
    if (existing !== undefined) return toRecordingSession(existing);

    const recording: StoredRecording = {
      providerCallReference: input.providerCallReference,
      providerRecordingReference: stableFakeReference(
        "recording",
        input.idempotencyKey,
      ),
      status: "in_progress",
    };
    this.recordingsByReference.set(
      recording.providerRecordingReference,
      recording,
    );
    this.recordingsByIdempotencyKey.set(input.idempotencyKey, recording);
    return toRecordingSession(recording);
  }

  async stopRecording(
    providerCallReference: string,
    providerRecordingReference: string,
  ): Promise<RecordingSession> {
    const recording = this.requireRecording(providerRecordingReference);
    if (recording.providerCallReference !== providerCallReference) {
      throw new FakeProviderNotFoundError("recording");
    }
    recording.status = "completed";
    return toRecordingSession(recording);
  }

  async getRecording(
    providerRecordingReference: string,
  ): Promise<RecordingSession> {
    return toRecordingSession(
      this.requireRecording(providerRecordingReference),
    );
  }

  async downloadRecording(
    providerRecordingReference: string,
  ): Promise<RecordingMedia> {
    const recording = this.requireRecording(providerRecordingReference);
    if (recording.status !== "completed") {
      throw new FakeDialerTransitionError("answered", "created");
    }
    return {
      mediaType: "audio/mpeg",
      bytes: new Uint8Array([0x49, 0x44, 0x33]),
    };
  }

  async deleteRecording(providerRecordingReference: string): Promise<void> {
    this.requireRecording(providerRecordingReference);
    this.recordingsByReference.delete(providerRecordingReference);
  }

  async simulateDialing(providerCallReference: string): Promise<CallSession> {
    return this.simulate(providerCallReference, "dialing");
  }

  async simulateRinging(providerCallReference: string): Promise<CallSession> {
    return this.simulate(providerCallReference, "ringing");
  }

  async simulateAnswered(providerCallReference: string): Promise<CallSession> {
    return this.simulate(providerCallReference, "answered");
  }

  async simulateNoAnswer(providerCallReference: string): Promise<CallSession> {
    return this.simulate(providerCallReference, "no_answer");
  }

  async simulateFailure(providerCallReference: string): Promise<CallSession> {
    return this.simulate(providerCallReference, "failed");
  }

  private async simulate(
    providerCallReference: string,
    status: CallStatus,
  ): Promise<CallSession> {
    const call = this.requireCall(providerCallReference);
    this.transition(call, status);
    return toSession(call);
  }

  private transition(call: StoredCall, nextStatus: CallStatus): void {
    if (call.status === nextStatus) {
      return;
    }

    if (!allowedTransitions[call.status].includes(nextStatus)) {
      throw new FakeDialerTransitionError(call.status, nextStatus);
    }

    call.status = nextStatus;
  }

  private requireCall(providerCallReference: string): StoredCall {
    const call = this.callsByReference.get(providerCallReference);
    if (call === undefined) {
      throw new FakeProviderNotFoundError("call");
    }
    return call;
  }

  private requireRecording(
    providerRecordingReference: string,
  ): StoredRecording {
    const recording = this.recordingsByReference.get(
      providerRecordingReference,
    );
    if (recording === undefined)
      throw new FakeProviderNotFoundError("recording");
    return recording;
  }
}

function toRecordingSession(recording: StoredRecording): RecordingSession {
  return { provider: PROVIDER_NAME, ...recording };
}

function sameStartCallInput(
  left: StartCallInput,
  right: StartCallInput,
): boolean {
  return (
    left.merchantId === right.merchantId &&
    left.interviewId === right.interviewId &&
    left.customerPrivateRef === right.customerPrivateRef &&
    left.idempotencyKey === right.idempotencyKey &&
    left.destinationPhoneE164 === right.destinationPhoneE164
  );
}

function toSession(call: StoredCall): CallSession {
  return {
    provider: PROVIDER_NAME,
    providerCallReference: call.providerCallReference,
    status: call.status,
  };
}
