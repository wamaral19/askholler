import { describe, expect, it } from "vitest";
import { loadDatabaseEnvironment, loadServerEnvironment } from "./config";

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
});
