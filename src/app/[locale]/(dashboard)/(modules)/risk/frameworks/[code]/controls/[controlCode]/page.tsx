import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page/PageHeader";
import { Link } from "@/i18n/routing";
import { hasPermission } from "@/lib/rbac/check";
import { ControlDetailClient } from "@/components/risk/ControlDetailClient";

export default async function ControlDetailPage({
  params,
}: {
  params: Promise<{ code: string; controlCode: string }>;
}) {
  const { code, controlCode } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("risk");

  const fw = await db.riskFramework.findUnique({
    where: { code },
    include: { controls: { where: { code: controlCode } } },
  });
  if (!fw || fw.controls.length === 0) notFound();

  const control = fw.controls[0];
  const canWrite = hasPermission(ctx.role, "risk.write");

  return (
    <>
      <PageHeader
        title={control.title}
        description={`${control.code} · ${t(`severity.${control.severity}`)}`}
        breadcrumb={
          <Link
            href={`/risk/frameworks/${fw.code}`}
            className="text-secondary hover:text-primary"
          >
            {fw.name}
          </Link>
        }
      />
      <ControlDetailClient
        control={control}
        frameworkCode={fw.code}
        canWrite={canWrite}
      />
    </>
  );
}
