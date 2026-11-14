import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the production build against the LOCAL Supabase stack.
 *   npm run db:start && npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000", screenshot: "only-on-failure" },
  outputDir: "test-results",
  webServer: { command: "npx next start -p 3000", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /client.*\.spec\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /staff.*\.spec\.ts/, dependencies: ["iphone"] },
  ],
});
