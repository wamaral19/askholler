import type {
  TranscriptSegmentInput,
  TranscriptionProvider,
} from "@holler/domain";
import {
  FakeProviderIdempotencyConflictError,
  FakeProviderNotFoundError,
} from "./fake-provider-errors";
import { stableFakeReference } from "./stable-reference";

export const SYNTHETIC_TRANSCRIPT_V1: readonly TranscriptSegmentInput[] =
  Object.freeze([
    Object.freeze({
      sequence: 1,
      speaker: "researcher" as const,
      startMs: 0,
      endMs: 9_000,
      text: "What first introduced you to Juniper Row?",
    }),
    Object.freeze({
      sequence: 2,
      speaker: "customer" as const,
      startMs: 10_000,
      endMs: 24_000,
      text: "I first found the brand through a creator review, not through a Meta ad.",
    }),
    Object.freeze({
      sequence: 3,
      speaker: "researcher" as const,
      startMs: 25_000,
      endMs: 34_000,
      text: "What prompted today's purchase?",
    }),
    Object.freeze({
      sequence: 4,
      speaker: "customer" as const,
      startMs: 35_000,
      endMs: 50_000,
      text: "The restock email reminded me, and that is when I decided to buy the moisturizer.",
    }),
    Object.freeze({
      sequence: 5,
      speaker: "researcher" as const,
      startMs: 51_000,
      endMs: 61_000,
      text: "How did the moisturizer texture feel?",
    }),
    Object.freeze({
      sequence: 6,
      speaker: "customer" as const,
      startMs: 62_000,
      endMs: 78_000,
      text: "The texture felt ideal to me, and absorption was a five out of five.",
    }),
  ]);

interface SubmittedJob {
  readonly recordingRef: string;
  readonly providerJobRef: string;
}

/** Deterministic in-memory transcription provider for synthetic development. */
export class FakeTranscriptionProvider implements TranscriptionProvider {
  private readonly jobsByIdempotencyKey = new Map<string, SubmittedJob>();
  private readonly jobsByReference = new Map<string, SubmittedJob>();

  get jobCount(): number {
    return this.jobsByReference.size;
  }

  async submitRecording(input: {
    recordingRef: string;
    idempotencyKey: string;
  }): Promise<{ providerJobRef: string }> {
    const existing = this.jobsByIdempotencyKey.get(input.idempotencyKey);
    if (existing !== undefined) {
      if (existing.recordingRef !== input.recordingRef) {
        throw new FakeProviderIdempotencyConflictError("submitRecording");
      }
      return { providerJobRef: existing.providerJobRef };
    }

    const job: SubmittedJob = {
      recordingRef: input.recordingRef,
      providerJobRef: stableFakeReference("transcript", input.idempotencyKey),
    };
    this.jobsByIdempotencyKey.set(input.idempotencyKey, job);
    this.jobsByReference.set(job.providerJobRef, job);
    return { providerJobRef: job.providerJobRef };
  }

  async getTranscript(
    providerJobRef: string,
  ): Promise<readonly TranscriptSegmentInput[]> {
    if (!this.jobsByReference.has(providerJobRef)) {
      throw new FakeProviderNotFoundError("transcription job");
    }
    return SYNTHETIC_TRANSCRIPT_V1;
  }
}
