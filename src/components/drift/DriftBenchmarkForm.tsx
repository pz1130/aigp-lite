"use client";
import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutput } from "@/lib/trpc/types";
import type { RouterInput } from "@/lib/trpc/types";
import { useTranslations } from "next-intl";
import { FormLayout } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface PromptRow {
  promptText: string;
  expectedBehavior: string;
  referenceOutput: string;
}

type DriftBenchmark = NonNullable<RouterOutput["drift"]["byId"]>;

interface DriftBenchmarkFormProps {
  mode: "create" | "edit";
  benchmark?: DriftBenchmark;
}

export function DriftBenchmarkForm({
  mode,
  benchmark,
}: DriftBenchmarkFormProps) {
  const t = useTranslations("drift");
  const router = useRouter();
  const [name, setName] = useState(benchmark?.name ?? "");
  const [description, setDescription] = useState(benchmark?.description ?? "");
  const [threshold, setThreshold] = useState(String(benchmark?.threshold ?? 7));
  const [prompts, setPrompts] = useState<PromptRow[]>(
    benchmark?.prompts?.map((p) => ({
      promptText: p.promptText,
      expectedBehavior: p.expectedBehavior,
      referenceOutput: p.referenceOutput ?? "",
    })) ?? [],
  );
  const NONE = "none";
  const usecases = trpc.inventory.list.useQuery();
  const [usecaseId, setUsecaseId] = useState<string>(
    benchmark?.usecaseId ?? NONE,
  );

  const create = trpc.drift.create.useMutation({
    onSuccess: (r) => router.push(`/drift/${r.id}`),
  });
  const update = trpc.drift.update.useMutation({
    onSuccess: (r) => router.push(`/drift/${r.id}`),
  });

  function addPrompt() {
    setPrompts([
      ...prompts,
      { promptText: "", expectedBehavior: "", referenceOutput: "" },
    ]);
  }

  function removePrompt(i: number) {
    setPrompts(prompts.filter((_, idx) => idx !== i));
  }

  function updatePrompt(i: number, field: keyof PromptRow, value: string) {
    const next = [...prompts];
    next[i] = { ...next[i], [field]: value };
    setPrompts(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: RouterInput["drift"]["create"] = {
      name,
      description: description || undefined,
      threshold: parseFloat(threshold) || 7,
      usecaseId: usecaseId === NONE ? null : usecaseId,
      prompts: prompts
        .filter((p) => p.promptText.trim() && p.expectedBehavior.trim())
        .map((p) => ({
          promptText: p.promptText,
          expectedBehavior: p.expectedBehavior,
          referenceOutput: p.referenceOutput || undefined,
        })),
    };
    if (mode === "create") create.mutate(data);
    else update.mutate({ id: benchmark!.id, ...data });
  }

  return (
    <FormLayout
      onSubmit={handleSubmit}
      onCancel={() => router.push("/drift")}
      submitting={create.isPending || update.isPending}
      submitLabel={mode === "create" ? t("addBenchmark") : "Save"}
      cancelLabel="Cancel"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.name")}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        </div>
        <div>
          <label className="block text-sm text-primary mb-1.5">
            {t("fields.threshold")}
            <Input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div>
        <label className="block text-sm text-primary mb-1.5">
          {t("fields.description")}
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      <div>
        <label className="block text-sm text-primary mb-1.5">
          {t("linkSystem.label")}
        </label>
        <Select value={usecaseId} onValueChange={setUsecaseId}>
          <SelectTrigger>
            <SelectValue placeholder={t("linkSystem.label")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("linkSystem.none")}</SelectItem>
            {(usecases.data ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-primary">
            {t("form.prompts")}
          </h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addPrompt}
          >
            {t("form.addPrompt")}
          </Button>
        </div>
        {prompts.length === 0 && (
          <p className="text-sm text-tertiary">{t("empty")}</p>
        )}
        {prompts.map((prompt, i) => (
          <div key={i} className="rounded-md border border-muted p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-tertiary">
                #{i + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removePrompt(i)}
              >
                {t("form.removePrompt")}
              </Button>
            </div>
            <div>
              <label className="block text-xs text-tertiary mb-1">
                {t("form.promptText")}
                <Textarea
                  rows={2}
                  value={prompt.promptText}
                  onChange={(e) =>
                    updatePrompt(i, "promptText", e.target.value)
                  }
                />
              </label>
            </div>
            <div>
              <label className="block text-xs text-tertiary mb-1">
                {t("form.expectedBehavior")}
                <Input
                  value={prompt.expectedBehavior}
                  onChange={(e) =>
                    updatePrompt(i, "expectedBehavior", e.target.value)
                  }
                />
              </label>
            </div>
            <div>
              <label className="block text-xs text-tertiary mb-1">
                {t("form.referenceOutput")}
                <Input
                  value={prompt.referenceOutput}
                  onChange={(e) =>
                    updatePrompt(i, "referenceOutput", e.target.value)
                  }
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </FormLayout>
  );
}
