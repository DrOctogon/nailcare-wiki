import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for the Vault Explorer Next.js app.
 *
 * Specs live in `e2e/` so they never collide with the Vitest unit tests
 * (which target `src/**` + `test/**`). The dev server reads the sibling
 * Obsidian vault live, so these run against `next dev` on port 3737.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3737",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev --port 3737",
    url: "http://localhost:3737",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
