"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { PageHeader } from "@/components/page/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Pencil, FileText } from "@/components/ui/icons";

function TemplateCard({
  template,
}: {
  template: {
    id: string;
    name: string;
    description: string;
    isDefault: boolean;
    createdAt: Date;
    _count: { steps: number };
    steps: {
      stepIndex: number;
      assigneeRole: string | null;
      assigneeUserId: string | null;
    }[];
  };
}) {
  const t = useTranslations("workflow.templates");

  return (
    <Card className="group p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/workflow/templates/${template.id}`}
              className="font-medium text-accent underline hover:text-accent-hover"
            >
              {template.name}
            </Link>
            {template.isDefault && (
              <Badge variant="info" size="sm">
                {t("default")}
              </Badge>
            )}
          </div>
          {template.description && (
            <p className="mt-1 text-small text-secondary line-clamp-2">
              {template.description}
            </p>
          )}
          <p className="mt-2 text-xs text-tertiary">
            {t("stepCount", { count: template._count.steps })} ·{" "}
            {template.createdAt.toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/workflow/templates/${template.id}`}>
            <Button variant="ghost" size="sm">
              <Pencil size={14} />
              {t("edit")}
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

export default function TemplatesPage() {
  const t = useTranslations("workflow.templates");
  const tWorkflow = useTranslations("workflow");
  const { data: templates, isLoading } = trpc.workflow.listTemplates.useQuery();

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={
          <Link href="/workflow" className="text-secondary hover:text-primary">
            {tWorkflow("title")}
          </Link>
        }
        action={
          <Link href="/workflow/templates/new">
            <Button variant="primary" size="sm">
              <Plus size={14} />
              {t("create")}
            </Button>
          </Link>
        }
      />
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-default py-16 text-center">
          <FileText size={48} className="text-tertiary" />
          <p className="mt-4 font-medium text-primary">{t("empty.title")}</p>
          <p className="mt-1 text-small text-secondary">
            {t("empty.description")}
          </p>
        </div>
      )}
    </>
  );
}
