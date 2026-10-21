import { defineConfig } from "@playwright/test";
import "dotenv/config";
import { existsSync } from "node:fs";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        (existsSync(chrome) ? chrome : undefined),
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@localhost.test",
      ADMIN_PASSWORD:
        process.env.ADMIN_PASSWORD ?? "test-only-browser-password",
      SESSION_SECRET:
        process.env.SESSION_SECRET ??
        "test-only-browser-session-secret-32-characters",
      DATA_DIR: ".data/browser",
      MIN_FREE_BYTES: "1",
    },
  },
});
