import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { UsecaseForm } from "@/components/inventory/UsecaseForm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";

export default async function EditUsecase({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const u = await db.aiUsecase.findUnique({ where: { id } });
  if (!u) notFound();
  const t = await getTranslations("inventory");

  return (
    <>
      <PageHeader
        title={t("edit")}
        breadcrumb={<span className="text-secondary">{u.name}</span>}
      />
      <UsecaseForm
        id={u.id}
        initial={{
          name: u.name,
          autonomyLevel: u.autonomyLevel,
          deploymentType: u.deploymentType,
          description: u.description,
          modelCardMd: u.modelCardMd,
          intendedUseMd: u.intendedUseMd,
          prohibitedUseMd: u.prohibitedUseMd,
        }}
      />
    </>
  );
}
