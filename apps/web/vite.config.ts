import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// `shopify app dev` passes its tunnel as APP_URL; the app reads SHOPIFY_APP_URL.
if (process.env.APP_URL) process.env.SHOPIFY_APP_URL = process.env.APP_URL;

// Local runs read .env.local like the other scripts; deploys set the env.
// Variables already set (e.g. by `shopify app dev`) take precedence.
const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Twilio reaches the dev server through a tunnel at APP_BASE_URL and Shopify
// through the CLI tunnel; Vite rejects unknown Host headers
// unless those hostnames are allowed here.
const hostname = (url: string | undefined) => {
  try {
    return new URL(url ?? "").hostname;
  } catch {
    return undefined;
  }
};
const allowedHosts = [
  hostname(process.env.APP_BASE_URL),
  hostname(process.env.SHOPIFY_APP_URL),
].filter((host): host is string => Boolean(host));

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  // The dev.withholler.com tunnel and shopify.web.toml both expect 5173, so
  // fail instead of silently moving to another port.
  server: {
    port: 5173,
    strictPort: true,
    ...(allowedHosts.length ? { allowedHosts } : {}),
  },
});
