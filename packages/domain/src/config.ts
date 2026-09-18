import { z } from "zod";

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
});

const serverEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  APP_BASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DIALER_PROVIDER: z.enum(["fake", "ringcentral"]).default("fake"),
  TRANSCRIPTION_PROVIDER: z.enum(["fake"]).default("fake"),
  OBJECT_STORE_PROVIDER: z.enum(["fake", "s3"]).default("fake"),
});

const workerEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  WORKER_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(1_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(25),
  OUTBOX_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(1_000),
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(15_000),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function loadDatabaseEnvironment(
  environment: NodeJS.ProcessEnv,
): DatabaseEnvironment {
  return databaseEnvironmentSchema.parse(environment);
}

export function loadServerEnvironment(
  environment: NodeJS.ProcessEnv,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(environment);
}

export function loadWorkerEnvironment(
  environment: NodeJS.ProcessEnv,
): WorkerEnvironment {
  return workerEnvironmentSchema.parse(environment);
}
