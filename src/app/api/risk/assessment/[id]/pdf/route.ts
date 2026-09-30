import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { retrieve } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getSessionContext();
  if (!session) return new Response("unauthorized", { status: 401 });
  if (!hasPermission(session.role, "risk.read")) {
    return new Response("forbidden", { status: 403 });
  }

  const assessment = await prisma.usecaseRiskAssessment.findFirst({
    where: { id, orgId: session.orgId },
  });
  if (!assessment?.pdfFileKey)
    return new Response("not found", { status: 404 });

  const buf = await retrieve(assessment.pdfFileKey);

  return new Response(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="risk-assessment-${id}.pdf"`,
    },
  });
}
