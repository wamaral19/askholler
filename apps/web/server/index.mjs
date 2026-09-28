import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequestHandler } from "@react-router/express";
import express from "express";
import { createHostRouting } from "./host-routing.mjs";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const buildDirectory = path.resolve(
  webRoot,
  process.env.HOLLER_BUILD_DIRECTORY ?? "build",
);
const build = await import(
  pathToFileURL(path.join(buildDirectory, "server/index.js")).href
);
const resolveHost = createHostRouting({
  marketingUrl: process.env.HOLLER_MARKETING_URL,
  appBaseUrl: process.env.APP_BASE_URL,
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

app.use(
  "/assets",
  express.static(path.join(buildDirectory, "client/assets"), {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(express.static(path.join(buildDirectory, "client"), { maxAge: "1h" }));

if (resolveHost) {
  app.use((request, response, next) => {
    const redirect = resolveHost({
      host: request.headers.host,
      path: request.originalUrl,
      method: request.method,
    });
    if (redirect) return response.redirect(redirect.status, redirect.location);
    next();
  });
}

app.use(createRequestHandler({ build, mode: process.env.NODE_ENV }));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.info(JSON.stringify({ event: "web.started", port }));
});
