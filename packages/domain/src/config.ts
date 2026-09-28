import { z } from "zod";

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
});

const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().url().startsWith("postgresql://"),
    APP_BASE_URL: z.string().url(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    DIALER_PROVIDER: z.enum(["fake", "twilio"]).default("fake"),
    TRANSCRIPTION_PROVIDER: z.enum(["fake"]).default("fake"),
    OBJECT_STORE_PROVIDER: z.enum(["fake", "r2"]).default("fake"),
    WORKFORCE_AUTH_PROVIDER: z.enum(["synthetic", "oidc"]).default("synthetic"),
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_AUDIENCE: z.string().min(1).optional(),
    PII_KMS_KEY_ID: z.string().min(1).optional(),
    TWILIO_ACCOUNT_SID: z
      .string()
      .regex(/^AC[0-9a-fA-F]{32}$/)
      .optional(),
    TWILIO_API_KEY_SID: z
      .string()
      .regex(/^SK[0-9a-fA-F]{32}$/)
      .optional(),
    TWILIO_API_KEY_SECRET: z.string().min(16).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(16).optional(),
    TWILIO_TWIML_APP_SID: z
      .string()
      .regex(/^AP[0-9a-fA-F]{32}$/)
      .optional(),
    TWILIO_CALLER_ID: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .optional(),
    TWILIO_CALL_INTENT_SECRET: z.string().min(32).optional(),
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== "production") return;
    if (value.WORKFORCE_AUTH_PROVIDER !== "oidc")
      context.addIssue({
        code: "custom",
        path: ["WORKFORCE_AUTH_PROVIDER"],
        message: "Production requires OIDC workforce authentication",
      });
    if (!value.OIDC_ISSUER)
      context.addIssue({
        code: "custom",
        path: ["OIDC_ISSUER"],
        message: "Production OIDC issuer is required",
      });
    if (!value.OIDC_AUDIENCE)
      context.addIssue({
        code: "custom",
        path: ["OIDC_AUDIENCE"],
        message: "Production OIDC audience is required",
      });
    if (
      !value.PII_KMS_KEY_ID ||
      /example|replace|changeme/i.test(value.PII_KMS_KEY_ID)
    )
      context.addIssue({
        code: "custom",
        path: ["PII_KMS_KEY_ID"],
        message: "Production KMS key is required",
      });
    if (
      value.DIALER_PROVIDER === "fake" ||
      value.OBJECT_STORE_PROVIDER === "fake"
    )
      context.addIssue({
        code: "custom",
        message: "Production cannot use fake providers",
      });
    if (value.DIALER_PROVIDER === "twilio") {
      for (const key of [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_API_KEY_SID",
        "TWILIO_API_KEY_SECRET",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_TWIML_APP_SID",
        "TWILIO_CALLER_ID",
        "TWILIO_CALL_INTENT_SECRET",
      ] as const)
        if (!value[key])
          context.addIssue({
            code: "custom",
            path: [key],
            message: `Production Twilio configuration requires ${key}`,
          });
    }
    if (value.OBJECT_STORE_PROVIDER === "r2") {
      for (const key of [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
      ] as const)
        if (!value[key])
          context.addIssue({
            code: "custom",
            path: [key],
            message: `Production R2 configuration requires ${key}`,
          });
    }
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
