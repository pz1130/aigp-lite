import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { WorkflowActions } from "@/components/workflow/WorkflowActions";
import { PageHeader } from "@/components/page/PageHeader";
import { DetailLayout } from "@/components/page/DetailLayout";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format/intl";

function stepBadgeVariant(
  decision: string,
): "success" | "danger" | "info" | "warn" {
  switch (decision) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "requested_changes":
      return "warn";
    default:
      return "info";
  }
}

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("workflow");

  const instance = await db.workflowInstance.findUnique({
    where: { id },
    include: {
      steps: {
        orderBy: { stepIndex: "asc" },
        include: {
          decidedBy: { select: { id: true, name: true, email: true } },
        },
      },
      usecase: { select: { id: true, name: true } },
    },
  });

  if (!instance || instance.orgId !== ctx.orgId) notFound();

  // Resolve assignee user names for display
  const assigneeUserIds = [
    ...new Set(instance.steps.map((s) => s.assigneeUserId).filter(Boolean)),
  ] as string[];
  const assigneeUsers = assigneeUserIds.length
    ? await db.user.findMany({
        where: { id: { in: assigneeUserIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const assigneeById = Object.fromEntries(assigneeUsers.map((u) => [u.id, u]));

  return (
    <>
      <PageHeader
        title={instance.usecase.name}
        description={`${t("template")}: ${instance.template}`}
        breadcrumb={
          <Link href="/workflow" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
        action={
          <Badge variant="info" size="lg">
            {t("step")} {instance.currentStep + 1}/{instance.steps.length}
          </Badge>
        }
      />
      <DetailLayout
        main={
          <div className="space-y-4">
            {instance.steps.map((step) => {
              const isCurrent = step.stepIndex === instance.currentStep;
              const assigneeInfo = step.assigneeUserId
                ? assigneeById[step.assigneeUserId]
                : null;
              return (
                <div
                  key={step.stepIndex}
                  className={`rounded-lg border p-4 ${isCurrent ? "border-accent ring-1 ring-accent/20" : "border-border-default"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-primary">
                        {step.stepIndex + 1}. {step.stepName}
                      </p>
                      <p className="mt-0.5 text-small text-secondary">
                        {assigneeInfo
                          ? `${assigneeInfo.name ?? assigneeInfo.email}`
                          : t("assignedTo") +
                            ": " +
                            (step.assigneeRole ?? "—").replace(/_/g, " ")}
                      </p>
                    </div>
                    <Badge variant={stepBadgeVariant(step.decision)} size="md">
                      {t(`decision.${step.decision}`)}
                    </Badge>
                  </div>

                  {step.comment && (
                    <p className="mt-3 rounded-md bg-muted p-3 text-small text-secondary">
                      {step.comment}
                    </p>
                  )}

                  {(step.decidedAt || step.decidedBy) && (
                    <p
                      className="mt-2 text-xs text-tertiary"
                      suppressHydrationWarning
                    >
                      {step.decidedBy
                        ? `${step.decidedBy.name ?? step.decidedBy.email}`
                        : ""}
                      {step.decidedAt
                        ? ` · ${formatRelative(new Date(step.decidedAt), locale)}`
                        : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        }
        aside={
          instance.state === "open" ? (
            <WorkflowActions
              instanceId={instance.id}
              currentStep={instance.steps[instance.currentStep]}
              userId={ctx.userId}
              userRole={ctx.role}
            />
          ) : null
        }
      />
    </>
  );
}
