import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/rbac/check";
import { PageHeader } from "@/components/page";
import { MembersTable, type MemberRow } from "./MembersTable";
import { MembersPageActions } from "./MembersPageActions";
import { PendingInvitesPanel } from "./PendingInvitesPanel";

export default async function MembersPage() {
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("members");

  const canEditRole = hasPermission(ctx.role, "org.write");
  const canRemove = hasPermission(ctx.role, "org.delete");

  const rows = await db.membership.findMany({
    where: { orgId: ctx.orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });

  const members: MemberRow[] = rows.map((m) => ({
    userId: m.userId,
    name: m.user.name ?? "",
    email: m.user.email,
    role: m.role as MemberRow["role"],
    joinedAt: m.joinedAt,
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
        action={canEditRole ? <MembersPageActions /> : undefined}
      />
      {canEditRole && <PendingInvitesPanel />}
      <MembersTable
        members={members}
        canEditRole={canEditRole}
        canRemove={canRemove}
        currentUserId={ctx.userId}
      />
    </>
  );
}
