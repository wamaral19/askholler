import { existsSync } from "node:fs";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadDatabaseEnvironment } from "@holler/domain";
import { createDatabase } from "./client";

// Local runs read .env.local like the other scripts; deploys set the env.
if (!process.env.DATABASE_URL && existsSync(".env.local"))
  process.loadEnvFile(".env.local");

const environment = loadDatabaseEnvironment(process.env);
const { db, pool } = createDatabase(environment.DATABASE_URL);

try {
  await migrate(db, {
    migrationsFolder: new URL("../migrations", import.meta.url).pathname,
  });
} finally {
  await pool.end();
}
