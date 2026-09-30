import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getIntegrationAdapter } from "@/lib/integrations-ext/registry";
import { decryptJson } from "@/lib/crypto/secrets";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let creds: Record<string, string> = {};
  try {
    const { id } = await params;
    const integ = await prisma.enterpriseIntegration.findUnique({
      where: { id },
    });
    if (!integ) return new Response("unknown", { status: 401 });
    if (integ.integrationType !== "servicenow" || !integ.isActive) {
      return new Response("gone", { status: 410 });
    }
    const secretA = Buffer.from(req.headers.get("x-webhook-secret") ?? "");
    const secretB = Buffer.from(integ.inboundSecret ?? "");
    if (
      secretA.length !== secretB.length ||
      !timingSafeEqual(secretA, secretB)
    ) {
      return new Response("unauthorized", { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return new Response("bad request", { status: 400 });

    const adapter = getIntegrationAdapter("servicenow");
    if (!adapter.applyInbound)
      return new Response("not implemented", { status: 501 });

    creds = decryptJson<Record<string, string>>(integ.credentialsEncrypted);

    const result = await adapter.applyInbound(integ, body, creds);
    const status =
      result.action === "skipped_echo"
        ? "skipped_echo"
        : result.action === "updated"
          ? "ok"
          : "not_found";

    await prisma.integrationSyncLog.create({
      data: {
        integrationId: integ.id,
        direction: "inbound",
        resourceType: result.resourceType,
        resourceId: result.resourceId,
        status,
        payloadHash: result.payloadHash,
        errorMessage:
          result.action === "not_found" ? "no matching local incident" : null,
      },
    });
    return Response.json({ accepted: true, action: result.action });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.integrationSyncLog
      .create({
        data: {
          integrationId: "unknown",
          direction: "inbound",
          status: "failed",
          errorMessage: msg.slice(0, 500),
        },
      })
      .catch(() => {});
    return new Response("internal error", { status: 500 });
  }
}
