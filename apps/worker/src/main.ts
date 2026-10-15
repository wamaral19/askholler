import { createDatabase } from "@holler/db";
import { R2PrivateObjectStore } from "@holler/providers";
import { loadWorkerEnvironment } from "@holler/domain";
import { pathToFileURL } from "node:url";
import { unavailableWorkerServices } from "./jobs";
import { renderReportRevision } from "./render-report";
import { qualifyCommerceEvent } from "./qualify-commerce-event";
import { runPrivacySweep, twilioRecordingDeleter } from "./privacy";
import { startWorkerRuntime } from "./runtime";
import { createTaskList } from "./tasks";

export async function main(): Promise<void> {
  const environment = loadWorkerEnvironment(process.env);
  const { db, pool } = createDatabase(environment.DATABASE_URL);
  const privacy = {
    objectStore:
      environment.R2_ACCOUNT_ID &&
      environment.R2_ACCESS_KEY_ID &&
      environment.R2_SECRET_ACCESS_KEY &&
      environment.R2_BUCKET
        ? new R2PrivateObjectStore({
            accountId: environment.R2_ACCOUNT_ID,
            accessKeyId: environment.R2_ACCESS_KEY_ID,
            secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
            bucket: environment.R2_BUCKET,
          })
        : undefined,
    deleteProviderRecording:
      environment.TWILIO_ACCOUNT_SID && environment.TWILIO_AUTH_TOKEN
        ? twilioRecordingDeleter(
            environment.TWILIO_ACCOUNT_SID,
            environment.TWILIO_AUTH_TOKEN,
          )
        : undefined,
    now: () => new Date(),
  };
  const taskList = {
    ...createTaskList({
      ...unavailableWorkerServices(),
      evaluateCommerceEvent: async (payload) => {
        await qualifyCommerceEvent(db, payload);
      },
      renderReport: async (payload) => {
        await renderReportRevision(db, payload);
      },
    }),
    // Scheduled by the runtime's crontab; takes no payload.
    privacy_sweep: async () => {
      await runPrivacySweep(db, privacy);
    },
  };
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
