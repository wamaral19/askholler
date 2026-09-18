import { loadServerEnvironment } from "@holler/domain";

const environment = loadServerEnvironment(process.env);

// Worker registration is intentionally added with the first durable job.
console.info(
  JSON.stringify({
    event: "worker.started",
    environment: environment.NODE_ENV,
  }),
);
