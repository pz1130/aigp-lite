"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { PageHeader } from "@/components/page/PageHeader";
import {
  TemplateBuilder,
  type TemplateStepInput,
} from "@/components/workflow/TemplateBuilder";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2 } from "@/components/ui/icons";
import { notFound } from "next/navigation";
import { use } from "react";

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("workflow.templates");
  const tWorkflow = useTranslations("workflow");
  const router = useRouter();

  const { data: template, isLoading } = trpc.workflow.getTemplate.useQuery({
    id,
  });
  const update = trpc.workflow.updateTemplate.useMutation({
    onSuccess: () => router.push("/workflow/templates"),
  });
  const deleteTpl = trpc.workflow.deleteTemplate.useMutation({
    onSuccess: () => router.push("/workflow/templates"),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [steps, setSteps] = useState<TemplateStepInput[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description ?? "");
      setIsDefault(template.isDefault);
      setSteps(
        template.steps.map((s) => ({
          stepName: s.stepName,
          assigneeRole: s.assigneeRole ?? "",
          assigneeUserId: s.assigneeUserId ?? "",
          instructions: s.instructions ?? "",
        })),
      );
    }
  }, [template]);

  if (isLoading)
    return <div className="h-96 animate-pulse rounded-lg bg-muted" />;
  if (!template) notFound();

  const handleSave = () => {
    if (!name.trim()) {
      setError(t("form.name") + " is required");
      return;
    }
    if (steps.length === 0 || steps.every((s) => !s.stepName.trim())) {
      setError(t("form.noSteps"));
      return;
    }
    setError("");
    update.mutate({
      id,
      name: name.trim(),
      description: description.trim(),
      isDefault,
      steps: steps
        .filter((s) => s.stepName.trim())
        .map((s, idx) => ({
          stepIndex: idx,
          stepName: s.stepName.trim(),
          assigneeRole: s.assigneeRole || undefined,
          assigneeUserId: s.assigneeUserId || undefined,
          instructions: s.instructions?.trim() || undefined,
        })),
    });
  };

  return (
    <>
      <PageHeader
        title={template.name}
        breadcrumb={
          <>
            <Link
              href="/workflow"
              className="text-secondary hover:text-primary"
            >
              {tWorkflow("title")}
            </Link>
            <span className="text-tertiary">/</span>
            <Link
              href="/workflow/templates"
              className="text-secondary hover:text-primary"
            >
              {t("title")}
            </Link>
          </>
        }
        action={
          <div className="flex items-center gap-2">
            {template.isDefault && (
              <Badge variant="info" size="md">
                {t("default")}
              </Badge>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={14} />
              {t("delete")}
            </Button>
          </div>
        }
      />
      <div className="space-y-6">
        <div className="rounded-lg border border-border-default p-4">
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-small font-medium text-primary">
                {t("form.name")} <span className="text-danger">*</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-border-default bg-input px-3 py-2 text-small"
                  placeholder={t("form.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                />
              </label>
            </div>
            <div>
              <label className="mb-1 block text-small font-medium text-primary">
                {t("form.description")}
                <input
                  type="text"
                  className="w-full rounded-md border border-border-default bg-input px-3 py-2 text-small"
                  placeholder={t("form.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                />
              </label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-small text-primary">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-border-default"
            />
            {t("form.isDefault")}
          </label>
        </div>

        <TemplateBuilder steps={steps} onChange={setSteps} />

        {error && <p className="text-small text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Link href="/workflow/templates">
            <Button variant="secondary" size="sm">
              {tWorkflow("action.reject")}
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={update.isPending}
          >
            {update.isPending ? t("form.saving") : t("form.save")}
          </Button>
        </div>
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogTitle>{t("form.deleteConfirm.title")}</DialogTitle>
          <DialogDescription>{t("form.deleteConfirm.body")}</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
            >
              {tWorkflow("action.reject")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteTpl.mutate({ id })}
            >
              {t("delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
