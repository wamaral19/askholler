import { createDatabase } from "@holler/db";
import type { WorkerEnvironment } from "@holler/domain";
import { run, type Runner, type TaskList } from "graphile-worker";
import { GraphileOutboxDispatcher } from "./outbox";

export interface WorkerRuntime {
  stop(signal?: string): Promise<void>;
  done: Promise<void>;
}

export interface RuntimeDependencies {
  startGraphile(options: {
    connectionString: string;
    concurrency: number;
    pollInterval: number;
    gracefulShutdownAbortTimeout: number;
    noHandleSignals: true;
    taskList: TaskList;
  }): Promise<Pick<Runner, "stop" | "promise">>;
  createDispatcher(databaseUrl: string): {
    drainBatch(batchSize: number): Promise<number>;
    close(): Promise<void>;
  };
}

export const defaultRuntimeDependencies: RuntimeDependencies = {
  startGraphile: run,
  createDispatcher(databaseUrl) {
    const { db, pool } = createDatabase(databaseUrl);
    const dispatcher = new GraphileOutboxDispatcher(db);
    return {
      drainBatch: (batchSize) => dispatcher.drainBatch(batchSize),
      close: () => pool.end(),
    };
  },
};

export async function startWorkerRuntime(
  environment: WorkerEnvironment,
  taskList: TaskList,
  dependencies: RuntimeDependencies = defaultRuntimeDependencies,
): Promise<WorkerRuntime> {
  const runner = await dependencies.startGraphile({
    connectionString: environment.DATABASE_URL,
    concurrency: environment.WORKER_CONCURRENCY,
    pollInterval: environment.WORKER_POLL_INTERVAL_MS,
    gracefulShutdownAbortTimeout: environment.WORKER_SHUTDOWN_TIMEOUT_MS,
    noHandleSignals: true,
    taskList,
  });
  const dispatcher = dependencies.createDispatcher(environment.DATABASE_URL);
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let activeDispatch: Promise<void> | undefined;

  const schedule = () => {
    if (!stopped)
      timer = setTimeout(() => {
        activeDispatch = dispatchOnce();
      }, environment.OUTBOX_POLL_INTERVAL_MS);
  };
  const dispatchOnce = async () => {
    try {
      let count: number;
      do {
        count = await dispatcher.drainBatch(environment.OUTBOX_BATCH_SIZE);
      } while (!stopped && count === environment.OUTBOX_BATCH_SIZE);
    } catch {
      console.error(JSON.stringify({ event: "outbox.dispatch_failed" }));
    } finally {
      schedule();
    }
  };
  activeDispatch = dispatchOnce();

  return {
    async stop(signal = "shutdown") {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      await runner.stop(signal);
      await activeDispatch;
      await dispatcher.close();
    },
    done: runner.promise,
  };
}
