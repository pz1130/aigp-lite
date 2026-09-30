"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { FormLayout } from "@/components/page";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const NONE = "none";

export function NewAuditClient() {
  const t = useTranslations("alignmentAudit");
  const router = useRouter();
  const usecases = trpc.inventory.list.useQuery();
  const probes = trpc.alignmentAudit.listProbes.useQuery();
  const [usecaseId, setUsecaseId] = useState(NONE);
  const [targetProvider, setTargetProvider] = useState<
    "anthropic" | "openai" | "google"
  >("anthropic");
  const [targetModel, setTargetModel] = useState("");

  const start = trpc.alignmentAudit.start.useMutation({
    onSuccess: (r) => router.push(`/alignment-audit/${r.id}`),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (usecaseId === NONE || !targetModel.trim()) return;
    start.mutate({
      usecaseId,
      targetProvider,
      targetModel: targetModel.trim(),
    });
  }

  const dimensions = [
    ...new Set(
      probes.data?.map((p: { dimension: string }) => p.dimension) ?? [],
    ),
  ];

  return (
    <FormLayout
      onSubmit={handleSubmit}
      onCancel={() => router.push("/alignment-audit")}
      submitting={start.isPending}
      submitLabel={t("start")}
      cancelLabel="Cancel"
    >
      <div>
        <label className="block text-sm text-primary mb-1.5">
          {t("system")}
        </label>
        <Select value={usecaseId} onValueChange={setUsecaseId}>
          <SelectTrigger>
            <SelectValue placeholder={t("system")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {usecases.data?.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-sm text-primary mb-1.5">
          {t("provider")}
        </label>
        <Select
          value={targetProvider}
          onValueChange={(v) =>
            setTargetProvider(v as "anthropic" | "openai" | "google")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="anthropic">Anthropic</SelectItem>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="google">Google</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-sm text-primary mb-1.5">
          {t("targetModel")}
          <Input
            className="mt-1.5"
            value={targetModel}
            onChange={(e) => setTargetModel(e.target.value)}
            placeholder="claude-sonnet-4-20250514"
            required
          />
        </label>
      </div>

      {dimensions.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("dimensions")}:{" "}
          {dimensions.map((d: string) => d.replace(/_/g, " ")).join(", ")}
        </p>
      )}
    </FormLayout>
  );
}
