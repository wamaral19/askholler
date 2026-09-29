import { createDatabase } from "@holler/db";
import { loadWorkerEnvironment } from "@holler/domain";
import { pathToFileURL } from "node:url";
import { unavailableWorkerServices } from "./jobs";
import { renderReportRevision } from "./render-report";
import { qualifyCommerceEvent } from "./qualify-commerce-event";
import { startWorkerRuntime } from "./runtime";
import { createTaskList } from "./tasks";

export async function main(): Promise<void> {
  const environment = loadWorkerEnvironment(process.env);
  const { db, pool } = createDatabase(environment.DATABASE_URL);
  const taskList = createTaskList({
    ...unavailableWorkerServices(),
    evaluateCommerceEvent: async (payload) => {
      await qualifyCommerceEvent(db, payload);
    },
    renderReport: async (payload) => {
      await renderReportRevision(db, payload);
    },
  });
  const runtime = await startWorkerRuntime(environment, taskList);

  console.info(
    JSON.stringify({
      event: "worker.started",
      environment: environment.NODE_ENV,
      concurrency: environment.WORKER_CONCURRENCY,
      tasks: Object.keys(taskList),
    }),
  );

  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => void runtime.stop(signal));
  try {
    await runtime.done;
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  void main().catch(() => {
    console.error(JSON.stringify({ event: "worker.start_failed" }));
    process.exitCode = 1;
  });
