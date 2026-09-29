import { describe, expect, it } from "vitest";
import {
  loadDatabaseEnvironment,
  loadServerEnvironment,
  loadWorkerEnvironment,
} from "./config";

const databaseUrl = "postgresql://holler:holler@localhost:5432/holler";

describe("environment configuration", () => {
  it("loads database-only commands without APP_BASE_URL", () => {
    expect(loadDatabaseEnvironment({ DATABASE_URL: databaseUrl })).toEqual({
      DATABASE_URL: databaseUrl,
    });
  });

  it("continues to require APP_BASE_URL for server processes", () => {
    expect(() =>
      loadServerEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
      }),
    ).toThrow();
  });

  it("loads a complete server process environment", () => {
    expect(
      loadServerEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        APP_BASE_URL: "http://localhost:3000",
      }),
    ).toMatchObject({
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      APP_BASE_URL: "http://localhost:3000",
    });
  });

  it("fails closed when production security providers are not configured", () => {
    expect(() =>
      loadServerEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        APP_BASE_URL: "https://holler.invalid",
      }),
    ).toThrow();
  });

  it("requires complete Twilio and R2 configuration when selected", () => {
    expect(() =>
      loadServerEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        APP_BASE_URL: "https://withholler.com",
        WORKFORCE_AUTH_PROVIDER: "oidc",
        OIDC_ISSUER: "https://securetoken.google.com/holler-production",
        OIDC_AUDIENCE: "holler-production",
        PII_KMS_KEY_ID:
          "projects/holler-production/locations/us/keyRings/pii/cryptoKeys/customer-data",
        DIALER_PROVIDER: "twilio",
        OBJECT_STORE_PROVIDER: "r2",
      }),
    ).toThrow();
  });

  it("loads a complete production configuration with Google sign-in", () => {
    const production = {
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl,
      APP_BASE_URL: "https://app.withholler.com",
      WORKFORCE_AUTH_PROVIDER: "oidc",
      OIDC_ISSUER: "https://accounts.google.com",
      OIDC_AUDIENCE: "1234.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-client-secret",
      WORKFORCE_ALLOWED_DOMAIN: "withholler.com",
      PII_KMS_KEY_ID:
        "projects/holler-production/locations/us/keyRings/pii/cryptoKeys/customer-data",
      DIALER_PROVIDER: "twilio",
      OBJECT_STORE_PROVIDER: "r2",
      TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`,
      TWILIO_API_KEY_SID: `SK${"1".repeat(32)}`,
      TWILIO_API_KEY_SECRET: "synthetic-api-key-secret",
      TWILIO_AUTH_TOKEN: "synthetic-auth-token",
      TWILIO_TWIML_APP_SID: `AP${"1".repeat(32)}`,
      TWILIO_CALLER_ID: "+12025550100",
      TWILIO_CALL_INTENT_SECRET: "x".repeat(32),
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "holler-production-private",
    };
    expect(loadServerEnvironment(production)).toMatchObject({
      WORKFORCE_ALLOWED_DOMAIN: "withholler.com",
    });
    for (const missing of [
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "WORKFORCE_ALLOWED_DOMAIN",
    ] as const) {
      const { [missing]: _omitted, ...rest } = production;
      expect(() => loadServerEnvironment(rest)).toThrow(missing);
    }
  });

  it("requires recording-deletion credentials for the production worker", () => {
    expect(() =>
      loadWorkerEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
      }),
    ).toThrow("R2_ACCOUNT_ID");
    expect(
      loadWorkerEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        R2_ACCOUNT_ID: "account",
        R2_ACCESS_KEY_ID: "access",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET: "bucket",
        TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`,
        TWILIO_AUTH_TOKEN: "synthetic-auth-token",
      }),
    ).toMatchObject({ NODE_ENV: "production" });
  });

  it("loads only worker-specific requirements and defaults", () => {
    expect(loadWorkerEnvironment({ DATABASE_URL: databaseUrl })).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: databaseUrl,
      LOG_LEVEL: "info",
      WORKER_CONCURRENCY: 5,
      WORKER_POLL_INTERVAL_MS: 1_000,
      OUTBOX_BATCH_SIZE: 25,
      OUTBOX_POLL_INTERVAL_MS: 1_000,
      WORKER_SHUTDOWN_TIMEOUT_MS: 15_000,
    });
  });

  it("coerces and validates worker runtime settings", () => {
    expect(
      loadWorkerEnvironment({
        DATABASE_URL: databaseUrl,
        WORKER_CONCURRENCY: "12",
        OUTBOX_BATCH_SIZE: "50",
      }),
    ).toMatchObject({ WORKER_CONCURRENCY: 12, OUTBOX_BATCH_SIZE: 50 });
    expect(() =>
      loadWorkerEnvironment({
        DATABASE_URL: databaseUrl,
        WORKER_CONCURRENCY: "0",
      }),
    ).toThrow();
  });
});
