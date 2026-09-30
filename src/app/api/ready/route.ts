import IORedis from "ioredis";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRedisUrl } from "@/lib/jobs/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "not_configured" | "error";

async function checkDatabase(): Promise<CheckStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<CheckStatus> {
  const url = getRedisUrl();
  if (!url) return "not_configured";

  const client = new IORedis(url, {
    lazyConnect: true,
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  // ioredis emits connection failures asynchronously as well as rejecting
  // commands. Attach a listener so a probe failure cannot become an
  // unhandled process-level error.
  client.on("error", () => undefined);

  try {
    await client.ping();
    return "ok";
  } catch {
    return "error";
  } finally {
    client.disconnect();
  }
}

export async function GET() {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ready = database === "ok" && redis !== "error";

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      checks: { database, redis },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
