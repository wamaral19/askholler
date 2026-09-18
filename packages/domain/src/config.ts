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

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;

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
