// Prisma 7 CLI no longer auto-loads .env; dotenv restores that for local
// commands (CI and Docker set DATABASE_URL in the environment directly).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  // Prisma 7 removed `url` from schema datasource blocks; the CLI reads it
  // from here instead (the runtime client gets it via the pg driver adapter).
  // No env() helper: it throws when the variable is unset, which would break
  // DB-less commands like `prisma generate` (CI generates before DATABASE_URL
  // is configured). Commands that do need a DB fail with a clear P1012 later.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Merged schema assembled by prisma/build-schema.mjs from prisma/core.prisma
  // + prisma/modules/*.prisma; npm scripts run the build first.
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
