import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    restoreMocks: true,
    // Leftover-workspace checks scan the shared OS temp dir. Parallel files
    // create and delete those dirs at the same time, so the count flakes.
    fileParallelism: false,
  },
});
