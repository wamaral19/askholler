import { randomUUID } from "node:crypto";
import { createDatabase, PostgresJobQueue } from "@holler/db";
import { loadServerEnvironment } from "@holler/domain";
import { runWorker } from "./worker";

const environment = loadServerEnvironment(process.env);

console.info(
  JSON.stringify({
    event: "worker.started",
    environment: environment.NODE_ENV,
  }),
);

const { db, pool } = createDatabase(environment.DATABASE_URL);
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

try {
  await runWorker(
    new PostgresJobQueue(db),
    {},
    {
      workerId: `worker-${randomUUID()}`,
      signal: controller.signal,
      onEvent: (event) => console.info(JSON.stringify(event)),
    },
  );
} finally {
  await pool.end();
}
