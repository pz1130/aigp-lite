import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { AuditPageClient, type AuditRow } from "./AuditTable";
import { getTranslations } from "next-intl/server";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("audit.integrity");

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
    <>
      <div className="mb-4">
        <Link
          href="/audit/integrity"
          className="text-accent hover:underline text-sm"
        >
          → {t("linkLabel")}
        </Link>
      </div>
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
    </>
  );
}
