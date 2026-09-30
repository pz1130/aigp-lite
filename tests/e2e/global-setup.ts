// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import type { FullConfig } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/lib/prisma";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ROLES, storageStateFor, emailFor, type Role } from "./helpers/auth";

// Keep browser setup aligned with the app server. TEST_DATABASE_URL is the
// dedicated local/CI E2E database; falling back to DATABASE_URL preserves CI
// jobs that inject only that variable.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// NextAuth v5 cookie name when running over plain HTTP (e.g. localhost dev
// server). For HTTPS deployments the prefix becomes `__Secure-` — keep the
// e2e setup aimed at http://localhost:3000.
const COOKIE_NAME = "authjs.session-token";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const SECRET = process.env.NEXTAUTH_SECRET;
if (!SECRET) {
  throw new Error(
    "[e2e] NEXTAUTH_SECRET is required to mint session JWTs. " +
      "Load it from .env before running Playwright.",
  );
}

// The original implementation drove the live login flow through
// /api/auth/callback/credentials. Auth.js v5 beta's response sequence
// (302 + Set-Cookie) doesn't replay reliably under Playwright's
// `request.newContext()`, so every spec was blocked at globalSetup.
// Instead, mint the same JWT the auth callback would produce and write it
// directly into Playwright's storageState. This bypasses the HTTP dance
// entirely while still producing the cookie shape the running app reads.
async function mintStorageState(
  prisma: PrismaClient,
  role: Role,
): Promise<void> {
  const email = emailFor(role);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(
      `[e2e] Demo user "${email}" not seeded. Run \`npm run prisma:seed\` first.`,
    );
  }

  const token = await encode({
    secret: SECRET!,
    salt: COOKIE_NAME,
    maxAge: MAX_AGE_SECONDS,
    token: {
      // Matches the shape produced by authConfig.callbacks.jwt in
      // src/lib/auth/auth.ts: { sub, userId, email, name }.
      sub: user.id,
      userId: user.id,
      email: user.email,
      name: user.name ?? undefined,
    },
  });

  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const storageState = {
    cookies: [
      {
        name: COOKIE_NAME,
        value: token,
        domain: "localhost",
        path: "/",
        expires,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };

  await fs.writeFile(
    storageStateFor(role),
    JSON.stringify(storageState, null, 2),
  );
}

export default async function globalSetup(_config: FullConfig) {
  const authDir = path.dirname(storageStateFor("admin"));
  await fs.mkdir(authDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    for (const role of ROLES) {
      await mintStorageState(prisma, role);
      // eslint-disable-next-line no-console
      console.log(`[e2e] storageState saved for ${role}`);
    }

    // Ensure Demo Org has an embedding-capable provider so dedup tests can run.
    // The demo provider "mock-local" exists in the Demo Org from the main seed;
    // we add supportsEmbeddings here (idempotent, no-op if already set).
    const demoOrg = await prisma.organization.findFirst({
      where: { name: "Demo Org" },
    });
    if (demoOrg) {
      const demoConn = await prisma.providerConnection.findFirst({
        where: { name: "mock-local", orgId: demoOrg.id },
      });
      if (demoConn) {
        const cfg = (demoConn.config as Record<string, unknown>) ?? {};
        if (!cfg.supportsEmbeddings) {
          await prisma.providerConnection.update({
            where: { id: demoConn.id },
            data: { config: { ...cfg, supportsEmbeddings: true } },
          });
          // eslint-disable-next-line no-console
          console.log(
            "[e2e] enabled supportsEmbeddings on Demo Org's mock-local connection",
          );
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
