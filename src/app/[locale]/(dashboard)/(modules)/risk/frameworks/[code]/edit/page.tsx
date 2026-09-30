import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { FrameworkForm } from "@/components/risk/FrameworkForm";
import { PageHeader } from "@/components/page/PageHeader";

export default async function EditFrameworkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("risk");

  const fw = await db.riskFramework.findUnique({ where: { code } });
  if (!fw) notFound();

  return (
    <>
      <PageHeader
        title={t("editFramework")}
        breadcrumb={<span className="text-secondary">{fw.name}</span>}
      />
      <FrameworkForm
        id={fw.id}
        initial={{
          code: fw.code,
          name: fw.name,
          version: fw.version,
          description: fw.description,
        }}
      />
    </>
  );
}
