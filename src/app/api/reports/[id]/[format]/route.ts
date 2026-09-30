import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { readReportFile } from "@/lib/reports/storage";
import { writeAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await params;
  if (!["pdf", "xlsx"].includes(format)) {
    return new Response("invalid format", { status: 400 });
  }

  const session = await getSessionContext();
  if (!session) return new Response("unauthorized", { status: 401 });
  if (!hasPermission(session.role, "reports.read")) {
    return new Response("forbidden", { status: 403 });
  }

  const row = await prisma.report.findFirst({
    where: { id, orgId: session.orgId },
  });
  if (!row) return new Response("not found", { status: 404 });

  const key = format === "pdf" ? row.pdfFileKey : row.excelFileKey;
  if (!key) return new Response("not found", { status: 404 });

  const buf = await readReportFile(key);

  await writeAudit({
    orgId: session.orgId,
    actorId: session.userId,
    action: "report.download",
    resourceType: "report",
    resourceId: row.id,
    after: { format },
  });

  return new Response(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type":
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${row.templateId}-${row.periodEnd.toISOString().slice(0, 10)}.${format}"`,
    },
  });
}
