import { loadWorkerEnvironment } from "@holler/domain";
import { pathToFileURL } from "node:url";
import { unavailableWorkerServices } from "./jobs";
import { startWorkerRuntime } from "./runtime";
import { createTaskList } from "./tasks";

export async function main(): Promise<void> {
  const environment = loadWorkerEnvironment(process.env);
  const taskList = createTaskList(unavailableWorkerServices());
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
  await runtime.done;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  void main().catch(() => {
    console.error(JSON.stringify({ event: "worker.start_failed" }));
    process.exitCode = 1;
  });
