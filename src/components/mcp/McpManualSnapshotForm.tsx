"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function McpManualSnapshotForm({ serverId }: { serverId: string }) {
  const t = useTranslations("mcp");
  const [json, setJson] = useState("");
  const utils = trpc.useUtils();
  const submit = trpc.mcp.submitSnapshot.useMutation({
    onSuccess: () => {
      setJson("");
      void utils.mcp.invalidate();
    },
  });

  const resultKey =
    submit.data?.outcome === "matches_baseline"
      ? "drift.manualMatches"
      : submit.data?.outcome === "baseline_created"
        ? "drift.manualBaselineCreated"
        : submit.data?.outcome === "drift_detected"
          ? "drift.manualDrift"
          : null;

  return (
    <section>
      <h2 className="font-semibold">{t("drift.manualTitle")}</h2>
      <p className="mt-1 text-sm text-neutral-600">{t("drift.manualIntro")}</p>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder={t("drift.manualPlaceholder")}
        rows={6}
        className="mt-2 w-full rounded border border-border-default p-2 font-mono text-xs"
      />
      <Button
        type="button"
        disabled={!json.trim() || submit.isPending}
        onClick={() => submit.mutate({ serverId, toolsJson: json })}
        className="mt-2"
      >
        {t("drift.manualSubmit")}
      </Button>
      {resultKey && <p className="mt-2 text-sm">{t(resultKey)}</p>}
      {submit.error && (
        <p className="mt-2 text-sm text-red-700">{t("drift.manualInvalid")}</p>
      )}
    </section>
  );
}
