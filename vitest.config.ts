import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.ts",
      "prisma/**/*.test.ts",
      "tests/integration/**/*.test.ts",
    ],
    exclude: ["node_modules", "tests/e2e/**"],
    // Tests hit a shared real Postgres and load Prisma's native engine, which
    // is not safe to reload across worker threads (panics in CI). Forks give
    // per-file process isolation; fileParallelism keeps files sequential.
    pool: "forks",
    fileParallelism: false,
    // Auto-restore vi.stubGlobal/stubEnv between tests. Without this, fetch
    // stubs from provider tests leak into later files (e.g. break yoga-wasm
    // load in pdf renderer).
    unstubGlobals: true,
    unstubEnvs: true,
    environmentOptions: {
      jsdom: { resources: "usable" },
    },
    server: {
      deps: {
        // next-intl 4's ESM build imports "next/navigation" without an
        // extension, which Node's ESM resolver rejects when the package is
        // externalized; let vite transform next-intl instead.
        inline: ["next-intl"],
      },
    },
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./tests/unit-global-setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(configDir, "./src") } },
});
