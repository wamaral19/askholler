export interface ClaimedJob {
  readonly id: string;
  readonly merchant_id: string;
  readonly job_type: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export interface DurableQueue {
  claim(workerId: string, now?: Date): Promise<unknown>;
  complete(
    merchantId: string,
    jobId: string,
    workerId: string,
    now?: Date,
  ): Promise<unknown>;
  retry(
    merchantId: string,
    jobId: string,
    workerId: string,
    availableAt: Date,
    errorCode: string,
  ): Promise<unknown>;
  fail(
    merchantId: string,
    jobId: string,
    workerId: string,
    errorCode: string,
    now?: Date,
  ): Promise<unknown>;
  recoverStaleLocks(staleBefore: Date, now?: Date): Promise<unknown>;
}

export type JobHandler = (job: ClaimedJob) => Promise<void>;

export interface WorkerOptions {
  readonly workerId: string;
  readonly maxAttempts?: number;
  readonly retryBaseMs?: number;
  readonly now?: () => Date;
  readonly onEvent?: (event: Readonly<Record<string, unknown>>) => void;
}

function claimedJob(value: unknown): ClaimedJob | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.merchant_id !== "string" ||
    typeof row.job_type !== "string" ||
    typeof row.attempts !== "number"
  )
    return undefined;
  return row as unknown as ClaimedJob;
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.name) return error.name.slice(0, 120);
  return "job_handler_error";
}

export async function processNextJob(
  queue: DurableQueue,
  handlers: Readonly<Record<string, JobHandler>>,
  options: WorkerOptions,
): Promise<boolean> {
  const now = options.now ?? (() => new Date());
  const job = claimedJob(await queue.claim(options.workerId, now()));
  if (!job) return false;
  const maxAttempts = options.maxAttempts ?? 5;
  const handler = handlers[job.job_type];
  try {
    if (!handler)
      throw Object.assign(new Error("Unsupported durable job type"), {
        name: "unsupported_job_type",
      });
    await handler(job);
    await queue.complete(job.merchant_id, job.id, options.workerId, now());
    options.onEvent?.({
      event: "worker.job_completed",
      jobId: job.id,
      jobType: job.job_type,
    });
  } catch (error) {
    const code = errorCode(error);
    if (job.attempts >= maxAttempts || code === "unsupported_job_type") {
      await queue.fail(job.merchant_id, job.id, options.workerId, code, now());
      options.onEvent?.({
        event: "worker.job_failed",
        jobId: job.id,
        jobType: job.job_type,
        errorCode: code,
      });
    } else {
      const delay =
        (options.retryBaseMs ?? 1_000) * 2 ** Math.max(0, job.attempts - 1);
      await queue.retry(
        job.merchant_id,
        job.id,
        options.workerId,
        new Date(now().getTime() + delay),
        code,
      );
      options.onEvent?.({
        event: "worker.job_retry_scheduled",
        jobId: job.id,
        jobType: job.job_type,
        errorCode: code,
      });
    }
  }
  return true;
}

export async function runWorker(
  queue: DurableQueue,
  handlers: Readonly<Record<string, JobHandler>>,
  options: WorkerOptions & {
    readonly signal: AbortSignal;
    readonly pollMs?: number;
    readonly staleLockMs?: number;
  },
): Promise<void> {
  const now = options.now ?? (() => new Date());
  await queue.recoverStaleLocks(
    new Date(now().getTime() - (options.staleLockMs ?? 300_000)),
    now(),
  );
  while (!options.signal.aborted) {
    const processed = await processNextJob(queue, handlers, options);
    if (!processed)
      await new Promise<void>((resolve) =>
        setTimeout(resolve, options.pollMs ?? 1_000),
      );
  }
}
