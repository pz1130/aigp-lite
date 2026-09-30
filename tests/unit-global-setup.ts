// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import { PrismaClient } from "@/lib/prisma";
import { execFileSync } from "node:child_process";

/**
 * Runs once before any unit test file. Truncates every public table in one
 * CASCADE so subsequent tests start from a clean slate, regardless of what
 * e2e or development sessions left behind. Without this, deleteMany chains
 * in beforeAll hooks can hit FK violations when a new e2e spec writes rows
 * the unit test cleanup list doesn't know about.
 *
 * Safety: refuses to truncate if TEST_DATABASE_URL is not set and the
 * default DATABASE_URL points at a database that already has organizations
 * (i.e. real dev data). This prevents `vitest run` from silently wiping a
 * developer's local DB.
 */
export default async function setup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (testUrl) {
    process.env.DATABASE_URL = testUrl;
    // Keep the dedicated test database aligned with the current migration set.
    // This prevents stale schemas from leaking old columns out of audit/log
    // forwarding and similar cross-cutting code paths during test runs.
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl },
      stdio: "inherit",
    });
  }

  const prisma = new PrismaClient();
  try {
    if (!testUrl) {
      // No dedicated test DB configured — make sure we're not about to nuke real data.
      let orgCount = 0;
      try {
        orgCount = await prisma.organization.count();
      } catch {
        // Table might not exist yet (fresh DB). Safe to proceed in that case.
        orgCount = 0;
      }
      if (orgCount > 0) {
        throw new Error(
          "Refusing to TRUNCATE: TEST_DATABASE_URL is not set and DATABASE_URL points at a database with existing organizations. " +
            "Set TEST_DATABASE_URL to a dedicated test database (e.g. postgresql://aigp:aigp@localhost:5432/aigp_test?schema=public) " +
            "and run `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy` once to provision it.",
        );
      }
    }

    const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE '\\_prisma_%'
    `;
    if (rows.length === 0) return;
    const quoted = rows.map((r) => `"${r.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
