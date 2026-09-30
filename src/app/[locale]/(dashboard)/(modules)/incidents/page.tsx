import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { IncidentsPageClient } from "./IncidentsPageClient";
import type { IncidentRow } from "./IncidentsTable";

export default async function IncidentsPage() {
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);

  const incidents = await db.incident.findMany({
    orderBy: { openedAt: "desc" },
    include: {
      openedBy: { select: { id: true, name: true, email: true } },
      closedBy: { select: { id: true, name: true, email: true } },
      usecase: { select: { id: true, name: true } },
    },
  });

  return <IncidentsPageClient incidents={incidents as IncidentRow[]} />;
}
