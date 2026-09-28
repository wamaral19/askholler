import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrivateObjectStore } from "@holler/domain";
import { transferRecording, type RecordingSource } from "./recording-transfer";

const bytes = new TextEncoder().encode("call audio");
const checksum = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function source(overrides: Partial<RecordingSource> = {}): RecordingSource {
  return {
    download: vi
      .fn()
      .mockResolvedValue({ bytes, mediaType: "audio/mpeg", checksum }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function destination(resultChecksum = checksum): PrivateObjectStore {
  return {
    put: vi.fn().mockResolvedValue({ checksum: resultChecksum }),
    delete: vi.fn().mockResolvedValue(undefined),
    createDownloadUrl: vi
      .fn()
      .mockResolvedValue("https://private.example/signed"),
  };
}

describe("transferRecording", () => {
  it("deletes the provider copy only after a verified destination upload", async () => {
    const provider = source();
    const store = destination();
    await expect(
      transferRecording({
        source: provider,
        destination: store,
        sourceReference: "provider-recording-1",
        destinationKey: "recordings/merchant/interview.mp3",
      }),
    ).resolves.toEqual({
      key: "recordings/merchant/interview.mp3",
      checksum,
      sourceDeleted: true,
    });
    expect(store.put).toHaveBeenCalledWith({
      key: "recordings/merchant/interview.mp3",
      mediaType: "audio/mpeg",
      bytes,
    });
    expect(provider.delete).toHaveBeenCalledWith("provider-recording-1");
  });

  it("keeps the provider copy when upload fails or its checksum differs", async () => {
    const provider = source();
    const failedStore = destination();
    vi.mocked(failedStore.put).mockRejectedValue(new Error("R2_PUT_FAILED"));
    await expect(
      transferRecording({
        source: provider,
        destination: failedStore,
        sourceReference: "one",
        destinationKey: "one.mp3",
      }),
    ).rejects.toThrow("R2_PUT_FAILED");
    expect(provider.delete).not.toHaveBeenCalled();

    await expect(
      transferRecording({
        source: provider,
        destination: destination("sha256:wrong"),
        sourceReference: "one",
        destinationKey: "one.mp3",
      }),
    ).rejects.toThrow("RECORDING_DESTINATION_CHECKSUM_MISMATCH");
    expect(provider.delete).not.toHaveBeenCalled();
  });

  it("rejects corrupt source bytes before upload", async () => {
    const provider = source({
      download: vi.fn().mockResolvedValue({
        bytes,
        mediaType: "audio/mpeg",
        checksum: "sha256:not-the-bytes",
      }),
    });
    const store = destination();
    await expect(
      transferRecording({
        source: provider,
        destination: store,
        sourceReference: "one",
        destinationKey: "one.mp3",
      }),
    ).rejects.toThrow("RECORDING_SOURCE_CHECKSUM_MISMATCH");
    expect(store.put).not.toHaveBeenCalled();
    expect(provider.delete).not.toHaveBeenCalled();
  });
});
