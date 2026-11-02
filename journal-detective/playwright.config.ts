import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3100", launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined, args: ["--no-sandbox"] } },
  webServer: {
    command: "npm run db:reset && npm run build && npx next start -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 240000,
    env: { DATABASE_URL: "file:./e2e.db", SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-123456", STORAGE_DIR: "./storage-e2e", DISABLE_EXTERNAL_LOOKUPS: "1", INSECURE_COOKIES: "1", DEMO_PASSWORD: "demo-journal-detective", PUBLIC_BASE_URL: "http://localhost:3100" },
  },
});
