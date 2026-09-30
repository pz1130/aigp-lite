"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export function ModelCardGenerate() {
  const t = useTranslations();
  const usecases = trpc.inventory.list.useQuery();
  const gen = trpc.redteam.modelCard.generate.useMutation();
  const [usecaseId, setUsecaseId] = useState("");
  const [result, setResult] = useState<{
    markdown?: string;
    pdfBase64?: string;
  } | null>(null);

  async function go(format: "markdown" | "pdf") {
    const r = await gen.mutateAsync({ usecaseId, format });
    setResult(r);
    if (format === "pdf" && r.pdfBase64) {
      const buf = Buffer.from(r.pdfBase64, "base64");
      const url = URL.createObjectURL(
        new Blob([buf], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "model-card.pdf";
      a.click();
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      <Select value={usecaseId} onValueChange={setUsecaseId}>
        <SelectTrigger>
          <SelectValue
            placeholder={t("redteam.modelCard.chooseUsecase", {
              defaultValue: "Choose a use case...",
            })}
          />
        </SelectTrigger>
        <SelectContent>
          {(usecases.data ?? []).map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!usecaseId || gen.isPending}
          onClick={() => go("markdown")}
        >
          {t("redteam.modelCard.markdown", { defaultValue: "Markdown" })}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!usecaseId || gen.isPending}
          onClick={() => go("pdf")}
        >
          {t("redteam.modelCard.pdf", { defaultValue: "PDF" })}
        </Button>
      </div>
      {result?.markdown && (
        <pre className="rounded-md border border-border-default bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap text-primary">
          {result.markdown}
        </pre>
      )}
    </div>
  );
}
