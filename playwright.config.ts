import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for the Vault Explorer Next.js app.
 *
 * Specs live in `e2e/` so they never collide with the Vitest unit tests
 * (which target `src/**` + `test/**`). The dev server reads a vault live, so
 * these run against `next dev` on port 3737.
 *
 * To keep E2E deterministic (and to run without the private Obsidian vault),
 * we always point the dev server at the tiny synthetic fixture vault checked
 * into the repo at `test/fixtures/vault`, via WIKI_VAULT_PATH. Resolved against
 * cwd (the repo root, where Playwright is invoked) — NOT import.meta, which CI
 * loads as CommonJS and rejects.
 */
const FIXTURE_VAULT_PATH = path.resolve(process.cwd(), "test/fixtures/vault");
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
    env: {
      WIKI_VAULT_PATH: process.env.WIKI_VAULT_PATH ?? FIXTURE_VAULT_PATH,
    },
  },
});
