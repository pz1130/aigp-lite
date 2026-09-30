import { Link } from "@/i18n/routing";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page/PageHeader";
import { WorkflowTable } from "@/components/workflow/WorkflowTable";
import { StartWorkflowForm } from "@/components/workflow/StartWorkflowForm";
import { getTranslations } from "next-intl/server";
import { FileBarChart2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("workflow");

  const instances = await db.workflowInstance.findMany({
    where: { state: "open" },
    orderBy: { createdAt: "desc" },
    include: {
      steps: { orderBy: { stepIndex: "asc" } },
      usecase: { select: { id: true, name: true } },
    },
  });

  const openUsecaseIds = new Set(instances.map((i) => i.usecaseId));
  const allUsecases = await db.aiUsecase.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  const eligibleUsecases = allUsecases.filter((u) => !openUsecaseIds.has(u.id));

  const templates = await db.workflowTemplate.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, isDefault: true },
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/workflow/templates">
              <Button variant="ghost" size="sm">
                <FileBarChart2 size={14} />
                {t("templates.title")}
              </Button>
            </Link>
            <StartWorkflowForm
              usecases={eligibleUsecases}
              templates={templates}
            />
          </div>
        }
      />
      <WorkflowTable rows={instances} locale={locale} />
    </>
  );
}
