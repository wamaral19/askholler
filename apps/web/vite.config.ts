import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Twilio reaches the dev server through a tunnel at APP_BASE_URL; Vite
// rejects unknown Host headers unless that hostname is allowed here.
const appHost = (() => {
  try {
    return new URL(process.env.APP_BASE_URL ?? "").hostname;
  } catch {
    return undefined;
  }
})();

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  server: appHost ? { allowedHosts: [appHost] } : {},
});
