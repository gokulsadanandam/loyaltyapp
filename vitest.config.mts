import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Run through `npm test` (scripts/vitest.mjs), which fixes Windows drive-letter casing.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
