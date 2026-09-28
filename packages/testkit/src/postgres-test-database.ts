import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDatabase } from "@holler/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export type TestDatabase = ReturnType<typeof createDatabase>["db"];

export interface IsolatedTestDatabase {
  readonly db: TestDatabase;
  readonly schemaName: string;
  readonly databaseUrl: string;
  close(): Promise<void>;
}

export function testDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return environment.TEST_DATABASE_URL ?? environment.DATABASE_URL;
}

/**
 * Migrates a brand-new PostgreSQL database and removes it after the test. The
 * supplied disposable test server/database role must have CREATEDB. Generated
 * migrations explicitly reference public, so a database is the isolation
 * boundary rather than a non-public schema.
 */
export async function createIsolatedTestDatabase(
  databaseUrl: string,
): Promise<IsolatedTestDatabase> {
  const schemaName = `holler_test_${randomUUID().replaceAll("-", "")}`;
  const isolatedUrl = new URL(databaseUrl);
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database ${schemaName}`);
  isolatedUrl.pathname = `/${schemaName}`;
  const { db, pool } = createDatabase(isolatedUrl.toString());
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../../db/migrations", import.meta.url),
      ),
    });
  } catch (error) {
    await pool.end();
    await admin.query(`drop database ${schemaName}`);
    await admin.end();
    throw error;
  }

  return {
    db,
    schemaName,
    databaseUrl: isolatedUrl.toString(),
    async close() {
      await pool.end();
      await admin.query(`drop database ${schemaName}`);
      await admin.end();
    },
  };
}
