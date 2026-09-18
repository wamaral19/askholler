import type {
  CallSession,
  CallStatus,
  DialerProvider,
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
}

function sameStartCallInput(
  left: StartCallInput,
  right: StartCallInput,
): boolean {
  return (
    left.merchantId === right.merchantId &&
    left.interviewId === right.interviewId &&
    left.customerPrivateRef === right.customerPrivateRef &&
    left.idempotencyKey === right.idempotencyKey
  );
}

function toSession(call: StoredCall): CallSession {
  return {
    provider: PROVIDER_NAME,
    providerCallReference: call.providerCallReference,
    status: call.status,
  };
}
