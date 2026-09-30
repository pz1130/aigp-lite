"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ApplyValues = {
  name: string;
  description: string;
  severity: "low" | "medium" | "high";
  enforcementMode: "block" | "warn" | "log";
  scope: "input" | "output" | "both";
  ruleJsonText: string;
};

export function PolicyAssistantPanel({
  onApply,
}: {
  onApply: (v: ApplyValues) => void;
}) {
  const t = useTranslations("policyAssistant");
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");

  const enabledQuery = trpc.policyAssistant.isEnabled.useQuery();
  const usageQuery = trpc.policyAssistant.usageToday.useQuery(undefined, {
    enabled: open,
  });
  const generate = trpc.policyAssistant.generate.useMutation();

  if (!enabledQuery.data?.enabled) return null;

  return (
    <div className="rounded-md border border-border-default mb-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted cursor-pointer"
      >
        <span>{t("title")}</span>
        {open && usageQuery.data && (
          <span className="text-xs text-tertiary">
            {t("usageToday", {
              used: usageQuery.data.used,
              limit: usageQuery.data.limit,
            })}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-border-default p-4 space-y-3">
          <Textarea
            placeholder={t("placeholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={generate.isPending}
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={async () => {
                const r = await generate.mutateAsync({ description });
                onApply({
                  name: r.name,
                  description: r.description,
                  severity: r.severity,
                  enforcementMode: r.enforcementMode,
                  scope: r.scope,
                  ruleJsonText: JSON.stringify(r.ruleJson, null, 2),
                });
                usageQuery.refetch();
              }}
              disabled={description.length < 10 || generate.isPending}
            >
              {generate.isPending ? t("generating") : t("generate")}
            </Button>
            {generate.data && <StatusChip status={generate.data.status} />}
          </div>

          {generate.data && generate.data.status !== "failed" && (
            <SelfChecksList
              tests={generate.data.tests}
              diagnostics={generate.data.diagnostics ?? []}
            />
          )}

          {generate.error && (
            <p className="text-xs text-red-500">{generate.error.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: "ok" | "needs_review" | "failed" }) {
  const t = useTranslations("policyAssistant.status");
  const variant =
    status === "ok" ? "success" : status === "needs_review" ? "warn" : "danger";
  return (
    <Badge variant={variant} size="sm">
      {t(status)}
    </Badge>
  );
}

function SelfChecksList({
  tests,
  diagnostics,
}: {
  tests: { text: string; shouldHit: boolean; reason: string }[];
  diagnostics: { kind: string; testIndex?: number; message: string }[];
}) {
  const t = useTranslations("policyAssistant");
  const missByIdx = new Map(
    diagnostics
      .filter((d) => d.kind === "self_check_miss" && d.testIndex !== undefined)
      .map((d) => [d.testIndex!, d]),
  );
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-secondary">
        {t("selfChecks")}
      </summary>
      <ul className="mt-2 space-y-1">
        {tests.map((tc, i) => {
          const failed = missByIdx.has(i);
          return (
            <li key={i} className={failed ? "text-amber-500" : "text-tertiary"}>
              {failed ? "✗" : "✓"} {tc.reason} —{" "}
              {t(tc.shouldHit ? "expectedHit" : "expectedMiss")}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
