import { describe, expect, it } from "vitest";
import {
  FakeProviderIdempotencyConflictError,
  FakeTranscriptionProvider,
  SYNTHETIC_TRANSCRIPT_V1,
} from "./index";

const recordingInput = {
  recordingRef: "00000000-0000-7000-8000-000000000533",
  idempotencyKey: "juniper-row-repeat-moisturizer-v1:transcribe",
};

describe("FakeTranscriptionProvider", () => {
  it("returns the stable six-segment synthetic transcript", async () => {
    const provider = new FakeTranscriptionProvider();
    const job = await provider.submitRecording(recordingInput);

    expect(job).toEqual({
      providerJobRef: "fake-transcript-f8666289c08ac49ea0a8eeb1",
    });
    await expect(provider.getTranscript(job.providerJobRef)).resolves.toEqual(
      SYNTHETIC_TRANSCRIPT_V1,
    );
    expect(SYNTHETIC_TRANSCRIPT_V1).toHaveLength(6);
    expect(SYNTHETIC_TRANSCRIPT_V1[1]?.text).toContain("creator review");
    expect(SYNTHETIC_TRANSCRIPT_V1[3]?.text).toContain("restock email");
    expect(SYNTHETIC_TRANSCRIPT_V1[5]?.text).toContain("five out of five");
  });

  it("deduplicates submission and keeps output stable across provider instances", async () => {
    const provider = new FakeTranscriptionProvider();
    const first = await provider.submitRecording(recordingInput);
    const replay = await provider.submitRecording({ ...recordingInput });
    const anotherProvider = new FakeTranscriptionProvider();
    const another = await anotherProvider.submitRecording(recordingInput);

    expect(replay).toEqual(first);
    expect(another).toEqual(first);
    expect(provider.jobCount).toBe(1);
    await expect(
      provider.getTranscript(replay.providerJobRef),
    ).resolves.toEqual(SYNTHETIC_TRANSCRIPT_V1);
  });

  it("rejects reuse of an idempotency key for a different recording", async () => {
    const provider = new FakeTranscriptionProvider();
    await provider.submitRecording(recordingInput);

    await expect(
      provider.submitRecording({
        ...recordingInput,
        recordingRef: "different-recording",
      }),
    ).rejects.toBeInstanceOf(FakeProviderIdempotencyConflictError);
  });
});
