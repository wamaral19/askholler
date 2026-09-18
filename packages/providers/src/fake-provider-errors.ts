export class FakeProviderNotFoundError extends Error {
  constructor(resource: "call" | "transcription job") {
    super(`Unknown fake ${resource} reference`);
    this.name = "FakeProviderNotFoundError";
  }
}

export class FakeProviderIdempotencyConflictError extends Error {
  constructor(operation: "startCall" | "submitRecording") {
    super(`Idempotency key reused with different ${operation} input`);
    this.name = "FakeProviderIdempotencyConflictError";
  }
}

export class FakeDialerTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid fake dialer transition: ${from} -> ${to}`);
    this.name = "FakeDialerTransitionError";
  }
}
