import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// `server-only` throws when imported outside a React Server Component bundle.
// Alias it to an empty stub so server-only modules (vault.ts, markdown.ts,
// semantic-search.ts) can be imported directly in the Node test environment.
const serverOnlyStub = fileURLToPath(
  new URL("./test/stubs/server-only.ts", import.meta.url),
);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": serverOnlyStub,
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
  },
});
