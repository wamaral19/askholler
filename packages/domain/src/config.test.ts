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
});
