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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "prisma/**/*.test.ts"],
    exclude: ["node_modules", "tests/e2e/**"],
    pool: "forks",
    fileParallelism: false,
    unstubGlobals: true,
    unstubEnvs: true,
    environmentOptions: {
      jsdom: { resources: "usable" },
    },
    server: {
      deps: {
        inline: ["next-intl"],
      },
    },
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./tests/unit-global-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/generated/**"],
      reporter: ["text-summary", "json-summary", "html"],
    },
  },
  resolve: { alias: { "@": path.resolve(configDir, "./src") } },
});
