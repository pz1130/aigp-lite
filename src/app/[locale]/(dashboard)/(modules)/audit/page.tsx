import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { AuditPageClient, type AuditRow } from "./AuditTable";
import Link from "next/link";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const sp = await searchParams;
  const pageSize = 50;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const skip = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { ts: "desc" },
      skip,
      take: pageSize,
    }),
    db.auditLog.count(),
  ]);

  return (
    <AuditPageClient
      rows={rows satisfies AuditRow[]}
      total={total}
      page={page}
      pageSize={pageSize}
      breadcrumb={
        <Link href="/" className="text-secondary hover:text-primary">
          Dashboard
        </Link>
      }
    />
  );
}
