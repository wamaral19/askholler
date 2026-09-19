import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  buildDirectory: process.env.HOLLER_BUILD_DIRECTORY ?? "build",
} satisfies Config;
