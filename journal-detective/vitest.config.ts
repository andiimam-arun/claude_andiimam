import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/unit/server-only-stub.ts") } },
  test: {
    include: ["tests/unit/**/*.test.ts"], environment: "node", testTimeout: 30000, fileParallelism: false,
    globalSetup: ["tests/unit/globalSetup.ts"],
    env: { DATABASE_URL: "file:./test.db", DISABLE_EXTERNAL_LOOKUPS: "1", STORAGE_DIR: "./storage-test", NODE_ENV: "test" },
  },
});
