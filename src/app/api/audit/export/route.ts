import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/rbac/check";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).optional().default(1000),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const ctx = await requireSession();
  assertPermission(ctx.role, "audit.read");
  const db = withOrg(prisma, ctx.orgId);
  const { searchParams } = new URL(req.url);

  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit"),
    action: searchParams.get("action"),
    resourceType: searchParams.get("resourceType"),
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
  });
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid query params",
        details: parsed.error.flatten(),
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );
  }
  const { limit, action, resourceType, startDate, endDate } = parsed.data;

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (resourceType) where.resourceType = resourceType;
  if (startDate || endDate) {
    where.ts = {};
    if (startDate)
      (where.ts as Record<string, unknown>).gte = new Date(startDate);
    if (endDate) (where.ts as Record<string, unknown>).lte = new Date(endDate);
  }

  const rows = await db.auditLog.findMany({
    where,
    orderBy: { ts: "desc" },
    take: limit,
  });

  const header = [
    "id",
    "ts",
    "action",
    "resourceType",
    "resourceId",
    "actorId",
    "ip",
    "userAgent",
    "before",
    "after",
  ];
  const csvRows = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.ts.toISOString(),
        r.action,
        r.resourceType,
        r.resourceId ?? "",
        r.actorId ?? "",
        r.ip ?? "",
        (r.userAgent ?? "").replace(/"/g, '""'),
        r.beforeJson != null ? JSON.stringify(r.beforeJson) : "",
        r.afterJson != null ? JSON.stringify(r.afterJson) : "",
      ]
        .map((v) => `"${v}"`)
        .join(","),
    ),
  ];

  return new Response(csvRows.join("\n"), {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="audit-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
