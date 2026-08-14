import { defineConfig, devices } from "@playwright/test";
import { E2E_AUTH_STATE_PATH, E2E_BASE_URL } from "./tests/e2e/fixtures";

const serverIsManagedByHarness = process.env.E2E_SERVER_MANAGED === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
  },
  webServer: serverIsManagedByHarness
    ? undefined
    : {
        command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4321",
        url: `${E2E_BASE_URL}/auth/signin`,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: E2E_AUTH_STATE_PATH,
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
