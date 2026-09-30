import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page/PageHeader";
import { Link } from "@/i18n/routing";
import { hasPermission } from "@/lib/rbac/check";
import { FrameworkDetailClient } from "@/components/risk/FrameworkDetailClient";
import { FrameworkActions } from "@/components/risk/FrameworkActions";
import { FrameworkDescriptionEditor } from "@/components/risk/FrameworkDescriptionEditor";

export default async function FrameworkControlsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("risk");

  const fw = await db.riskFramework.findUnique({
    where: { code },
    include: { controls: { orderBy: { code: "asc" } } },
  });
  if (!fw) notFound();

  const canWrite = hasPermission(ctx.role, "risk.write");
  const canDelete = hasPermission(ctx.role, "risk.delete");

  return (
    <>
      <PageHeader
        title={fw.name}
        description={`${fw.code} · v${fw.version} · ${fw.controls.length} ${t("controls")}`}
        breadcrumb={
          <Link href="/risk" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
        action={
          canDelete ? (
            <FrameworkActions fwId={fw.id} canDelete={canDelete} />
          ) : undefined
        }
      />
      <div className="mb-4 rounded-lg border border-border-default bg-surface p-4">
        <FrameworkDescriptionEditor
          frameworkId={fw.id}
          initialDescription={fw.description}
          canWrite={canWrite}
        />
      </div>
      <FrameworkDetailClient
        frameworkId={fw.id}
        frameworkCode={fw.code}
        controls={fw.controls}
        canWrite={canWrite}
        canDelete={canDelete}
      />
    </>
  );
}
