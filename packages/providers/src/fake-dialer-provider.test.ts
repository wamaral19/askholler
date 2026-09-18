import type { StartCallInput } from "@holler/domain";
import { describe, expect, it } from "vitest";
import {
  FakeDialerProvider,
  FakeDialerTransitionError,
  FakeProviderIdempotencyConflictError,
} from "./index";

const callInput: StartCallInput = {
  merchantId: "00000000-0000-7000-8000-000000000001",
  interviewId: "00000000-0000-7000-8000-000000000531",
  customerPrivateRef: "00000000-0000-7000-8000-000000000101",
  idempotencyKey: "juniper-row-repeat-moisturizer-v1:start-call",
};

describe("FakeDialerProvider", () => {
  it("requires the researcher-controlled manual dial step after startCall", async () => {
    const provider = new FakeDialerProvider();

    const session = await provider.startCall(callInput);

    expect(session).toEqual({
      provider: "fake_dialer",
      providerCallReference: "fake-call-ec694231aa19bee5994d0740",
      status: "manual_dial_ready",
    });
    await expect(
      provider.getCallStatus(session.providerCallReference),
    ).resolves.toBe("manual_dial_ready");
  });

  it("simulates answered and completed states deterministically", async () => {
    const provider = new FakeDialerProvider();
    const session = await provider.startCall(callInput);

    await expect(
      provider.simulateAnswered(session.providerCallReference),
    ).resolves.toMatchObject({
      status: "answered",
    });
    await provider.endCall(session.providerCallReference);
    await expect(
      provider.getCallStatus(session.providerCallReference),
    ).resolves.toBe("completed");

    // Provider retries are safe after the terminal state is reached.
    await provider.endCall(session.providerCallReference);
    await expect(
      provider.getCallStatus(session.providerCallReference),
    ).resolves.toBe("completed");
  });

  it("simulates a no-answer terminal result", async () => {
    const provider = new FakeDialerProvider();
    const session = await provider.startCall(callInput);

    await expect(
      provider.simulateNoAnswer(session.providerCallReference),
    ).resolves.toMatchObject({
      status: "no_answer",
    });
    await expect(
      provider.getCallStatus(session.providerCallReference),
    ).resolves.toBe("no_answer");
  });

  it("deduplicates startCall by idempotency key", async () => {
    const provider = new FakeDialerProvider();

    const first = await provider.startCall(callInput);
    const replay = await provider.startCall({ ...callInput });

    expect(replay).toEqual(first);
    expect(provider.callCount).toBe(1);
  });

  it("rejects reuse of an idempotency key for a different call", async () => {
    const provider = new FakeDialerProvider();
    await provider.startCall(callInput);

    await expect(
      provider.startCall({ ...callInput, interviewId: "different-interview" }),
    ).rejects.toBeInstanceOf(FakeProviderIdempotencyConflictError);
  });

  it("rejects invalid lifecycle transitions", async () => {
    const provider = new FakeDialerProvider();
    const session = await provider.startCall(callInput);
    await provider.simulateNoAnswer(session.providerCallReference);

    await expect(
      provider.simulateAnswered(session.providerCallReference),
    ).rejects.toBeInstanceOf(FakeDialerTransitionError);
  });
});
