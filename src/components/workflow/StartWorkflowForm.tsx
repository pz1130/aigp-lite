"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface EligibleUsecase {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
  isDefault: boolean;
}

export function StartWorkflowForm({
  usecases,
  templates,
}: {
  usecases: EligibleUsecase[];
  templates: Template[];
}) {
  const t = useTranslations("workflow");
  const router = useRouter();
  const [usecaseId, setUsecaseId] = useState<string>(usecases[0]?.id ?? "");
  const defaultTemplate =
    templates.find((tpl) => tpl.isDefault) ?? templates[0];
  const [templateId, setTemplateId] = useState<string>(
    defaultTemplate?.id ?? "",
  );

  const start = trpc.workflow.start.useMutation({
    onSuccess: () => router.refresh(),
  });

  if (usecases.length === 0) {
    return (
      <p className="text-small text-secondary">{t("noEligibleUsecases")}</p>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={usecaseId} onValueChange={setUsecaseId}>
        <SelectTrigger className="w-48" aria-label={t("selectUsecase")}>
          <SelectValue placeholder={t("selectUsecase")} />
        </SelectTrigger>
        <SelectContent>
          {usecases.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {templates.length > 0 && (
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger className="w-40" aria-label={t("selectTemplate")}>
            <SelectValue placeholder={t("selectTemplate")} />
          </SelectTrigger>
          <SelectContent>
            {templates.map((tpl) => (
              <SelectItem key={tpl.id} value={tpl.id}>
                {tpl.name}
                {tpl.isDefault ? " ★" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        type="button"
        onClick={() =>
          usecaseId && templateId && start.mutate({ usecaseId, templateId })
        }
        disabled={!usecaseId || !templateId || start.isPending}
      >
        {start.isPending ? t("processing") : t("startWorkflow")}
      </Button>
    </div>
  );
}
