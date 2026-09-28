import type { Task, TaskList } from "graphile-worker";
import {
  classifyJobError,
  jobSchemas,
  type JobName,
  type WorkerServices,
} from "./jobs";

type SafeLogger = {
  error(message: string, metadata?: Record<string, unknown>): void;
};

function task(name: JobName, execute: (payload: never) => Promise<void>): Task {
  return async (rawPayload, helpers) => {
    try {
      const payload = jobSchemas[name].parse(rawPayload) as never;
      await execute(payload);
    } catch (caught) {
      const error = classifyJobError(caught);
      (helpers.logger as SafeLogger).error(error.code, {
        errorCode: error.code,
        retryable: error.retryable,
      });
      if (error.retryable) throw new Error(error.code);
    }
  };
}

export function createTaskList(services: WorkerServices): TaskList {
  return {
    normalize_webhook: task("normalize_webhook", services.normalizeWebhook),
    evaluate_commerce_event: task(
      "evaluate_commerce_event",
      services.evaluateCommerceEvent,
    ),
    expire_assignments: task("expire_assignments", services.expireAssignment),
    render_report: task("render_report", services.renderReport),
  };
}
