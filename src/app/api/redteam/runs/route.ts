import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { isMoonshotEngineEnabled } from "@/lib/redteam/moonshot/config";
import { enqueueJob } from "@/lib/jobs/enqueue";

export const runtime = "nodejs";

const inputSchema = z.object({
  connectionId: z.string(),
  model: z.string().min(1).max(120),
  promptSourceIds: z.array(z.string().min(1)).min(1),
  judge: z.enum(["builtin", "nemo"]).default("builtin"),
  usecaseId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return new Response("unauthorized", { status: 401 });
  if (!hasPermission(session.role, "redteam.write"))
    return new Response("forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error.flatten()), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const conn = await prisma.providerConnection.findFirst({
    where: {
      id: parsed.data.connectionId,
      orgId: session.orgId,
      isActive: true,
    },
  });
  if (!conn) return new Response("connection not found", { status: 404 });

  if (parsed.data.usecaseId) {
    const uc = await prisma.aiUsecase.findFirst({
      where: { id: parsed.data.usecaseId, orgId: session.orgId },
    });
    if (!uc) return new Response("usecase not found", { status: 404 });
  }

  const ev = await prisma.evaluation.create({
    data: {
      orgId: session.orgId,
      usecaseId: parsed.data.usecaseId ?? null,
      connectionId: conn.id,
      model: parsed.data.model,
      promptSourceIds: parsed.data.promptSourceIds,
      judge: parsed.data.judge,
      status: "pending",
      createdBy: session.userId,
    },
  });

  // NeMo-judged runs stay on the builtin engine — skip Moonshot auto-routing
  // (Moonshot owns its own judgment, so Moonshot engine + NeMo judge is mutually exclusive).
  if (parsed.data.judge !== "nemo" && isMoonshotEngineEnabled()) {
    await prisma.evaluation.update({
      where: { id: ev.id },
      data: { engine: "moonshot" },
    });
    await enqueueJob("redteam.moonshot.run", { evaluationId: ev.id });
  }

  await writeAudit({
    orgId: session.orgId,
    actorId: session.userId,
    action: "redteam.run.start",
    resourceType: "evaluation",
    resourceId: ev.id,
    after: {
      connectionId: conn.id,
      model: parsed.data.model,
      promptSources: parsed.data.promptSourceIds.length,
      judge: parsed.data.judge,
      usecaseId: parsed.data.usecaseId ?? null,
    },
  });

  return Response.json({ evaluationId: ev.id });
}
