import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadServerEnvironment } from "@holler/domain";
import { createDatabase } from "./client";

const environment = loadServerEnvironment(process.env);
const { db, pool } = createDatabase(environment.DATABASE_URL);

try {
  await migrate(db, {
    migrationsFolder: new URL("../migrations", import.meta.url).pathname,
  });
} finally {
  await pool.end();
}
