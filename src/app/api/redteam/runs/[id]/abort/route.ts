import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { abortFlags } from "@/lib/redteam/abort-flags";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session) return new Response("unauthorized", { status: 401 });
  if (!hasPermission(session.role, "redteam.write"))
    return new Response("forbidden", { status: 403 });

  const ev = await prisma.evaluation.findFirst({
    where: { id, orgId: session.orgId },
  });
  if (!ev) return new Response("not found", { status: 404 });

  await abortFlags.set(id, true);
  await prisma.evaluation.update({
    where: { id },
    data: { status: "aborted", finishedAt: new Date() },
  });

  await writeAudit({
    orgId: session.orgId,
    actorId: session.userId,
    action: "redteam.run.abort",
    resourceType: "evaluation",
    resourceId: id,
  });

  return Response.json({ ok: true });
}
