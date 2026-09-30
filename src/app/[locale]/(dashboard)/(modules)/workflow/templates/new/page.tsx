"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { PageHeader } from "@/components/page/PageHeader";
import { TemplateBuilder } from "@/components/workflow/TemplateBuilder";
import { Button } from "@/components/ui/button";
import type { TemplateStepInput } from "@/components/workflow/TemplateBuilder";

export default function NewTemplatePage() {
  const t = useTranslations("workflow.templates");
  const tWorkflow = useTranslations("workflow");
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [steps, setSteps] = useState<TemplateStepInput[]>([
    { stepName: "", assigneeRole: "", assigneeUserId: "", instructions: "" },
  ]);
  const [error, setError] = useState("");

  const create = trpc.workflow.createTemplate.useMutation({
    onSuccess: (data) => {
      router.push(`/workflow/templates/${data.id}`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

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
    create.mutate({
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
        title={t("create")}
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
            disabled={create.isPending}
          >
            {create.isPending ? t("form.saving") : t("form.save")}
          </Button>
        </div>
      </div>
    </>
  );
}
