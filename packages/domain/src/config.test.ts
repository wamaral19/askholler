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
