import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@holler/domain": `${root}packages/domain/src/index.ts`,
      "@holler/providers": `${root}packages/providers/src/index.ts`,
      "@holler/db": `${root}packages/db/src/index.ts`,
      "@holler/testkit": `${root}packages/testkit/src/index.ts`,
      "@holler/shopify": `${root}packages/shopify/src/index.ts`,
      "@holler/research": `${root}packages/research/src/index.ts`,
      "@holler/evidence": `${root}packages/evidence/src/index.ts`,
      "@holler/reporting": `${root}packages/reporting/src/index.ts`,
    },
  },
  test: {
    environment: "node",
    coverage: { reporter: ["text", "json", "html"] },
  },
});
