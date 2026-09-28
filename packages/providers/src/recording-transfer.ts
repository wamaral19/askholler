import { createHash } from "node:crypto";
import type { PrivateObjectStore } from "@holler/domain";

export interface RecordingSource {
  download(reference: string): Promise<{
    bytes: Uint8Array;
    mediaType: string;
    checksum?: string;
  }>;
  delete(reference: string): Promise<void>;
}

export interface RecordingTransferResult {
  readonly key: string;
  readonly checksum: string;
  readonly sourceDeleted: true;
}

/** Copies, verifies, and only then removes a recording from its provider. */
export async function transferRecording(input: {
  source: RecordingSource;
  destination: PrivateObjectStore;
  sourceReference: string;
  destinationKey: string;
  /** Persist that the verified destination exists before source deletion. */
  afterStored?: (result: { key: string; checksum: string }) => Promise<void>;
}): Promise<RecordingTransferResult> {
  const recording = await input.source.download(input.sourceReference);
  if (!recording.mediaType || recording.bytes.byteLength === 0)
    throw new Error("RECORDING_SOURCE_INVALID");

  const actualChecksum = `sha256:${createHash("sha256")
    .update(recording.bytes)
    .digest("hex")}`;
  if (recording.checksum && recording.checksum !== actualChecksum)
    throw new Error("RECORDING_SOURCE_CHECKSUM_MISMATCH");

  const stored = await input.destination.put({
    key: input.destinationKey,
    mediaType: recording.mediaType,
    bytes: recording.bytes,
  });
  if (stored.checksum !== actualChecksum)
    throw new Error("RECORDING_DESTINATION_CHECKSUM_MISMATCH");

  await input.afterStored?.({
    key: input.destinationKey,
    checksum: actualChecksum,
  });
  await input.source.delete(input.sourceReference);
  return {
    key: input.destinationKey,
    checksum: actualChecksum,
    sourceDeleted: true,
  };
}
