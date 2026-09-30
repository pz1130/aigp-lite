"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  disparityRatio,
  FAIRNESS_THRESHOLD,
  type AttributeLite,
} from "@/lib/fairness/rubric";

type Check = "yes" | "no" | "not_applicable";
type Metric =
  "selection_rate" | "true_positive_rate" | "error_rate" | "precision";
type AttrDraft = {
  name: string;
  metric: Metric;
  subgroups: { label: string; value: string }[];
};

const METRICS: Metric[] = [
  "selection_rate",
  "true_positive_rate",
  "error_rate",
  "precision",
];
const CHECKS: Check[] = ["yes", "no", "not_applicable"];

export function UsecaseFairnessCard({
  usecaseId,
  canWrite,
}: {
  usecaseId: string;
  canWrite: boolean;
}) {
  const t = useTranslations("fairness");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.fairness.get.useQuery({ usecaseId });

  const [attributes, setAttributes] = useState<AttrDraft[]>([]);
  const [proxyReview, setProxyReview] = useState<Check | "">("");
  const [feedbackLoop, setFeedbackLoop] = useState<Check | "">("");

  useEffect(() => {
    if (!data) return;
    setAttributes(
      data.attributes.map((a) => ({
        name: a.name,
        metric: a.metric as Metric,
        subgroups: a.subgroups.map((s) => ({
          label: s.label,
          value: String(s.value),
        })),
      })),
    );
    setProxyReview((data.proxyReview as Check) ?? "");
    setFeedbackLoop((data.feedbackLoop as Check) ?? "");
  }, [data]);

  const save = trpc.fairness.save.useMutation({
    async onSuccess() {
      await utils.fairness.get.invalidate({ usecaseId });
    },
  });
  const complete = trpc.fairness.complete.useMutation({
    async onSuccess() {
      await utils.fairness.get.invalidate({ usecaseId });
    },
  });
  const reopen = trpc.fairness.reopen.useMutation({
    async onSuccess() {
      await utils.fairness.get.invalidate({ usecaseId });
    },
  });

  if (isLoading) return null;

  const status = data?.status ?? "draft";

  function toLite(a: AttrDraft): AttributeLite {
    return {
      name: a.name,
      metric: a.metric,
      subgroups: a.subgroups.map((s) => ({
        label: s.label,
        value: Number(s.value),
      })),
    };
  }

  return (
    <section className="rounded-lg border border-border-default bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-primary">
            {t("cardTitle")}
          </h2>
          <p className="text-sm text-secondary">{t("cardDescription")}</p>
        </div>
        <span className="rounded px-2 py-0.5 text-xs font-medium bg-muted">
          {t(`status.${status}`)}
        </span>
      </div>

      <div className="space-y-4">
        {attributes.length === 0 && (
          <p className="text-sm text-tertiary">{t("empty")}</p>
        )}

        {attributes.map((attr, ai) => {
          const ratio = disparityRatio(toLite(attr));
          return (
            <div
              key={ai}
              className="rounded border border-border-default p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  placeholder={t("attributeName")}
                  value={attr.name}
                  disabled={!canWrite || status === "completed"}
                  onChange={(e) => {
                    const next = [...attributes];
                    next[ai] = { ...attr, name: e.target.value };
                    setAttributes(next);
                  }}
                />
                <select
                  className="rounded border border-border-default bg-muted p-1 text-sm"
                  value={attr.metric}
                  disabled={!canWrite || status === "completed"}
                  onChange={(e) => {
                    const next = [...attributes];
                    next[ai] = { ...attr, metric: e.target.value as Metric };
                    setAttributes(next);
                  }}
                >
                  {METRICS.map((m) => (
                    <option key={m} value={m}>
                      {t(`metric.${m}`)}
                    </option>
                  ))}
                </select>
                {canWrite && status !== "completed" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setAttributes(attributes.filter((_, i) => i !== ai))
                    }
                  >
                    {t("remove")}
                  </Button>
                )}
              </div>

              {attr.subgroups.map((sg, si) => (
                <div key={si} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder={t("subgroup")}
                    value={sg.label}
                    disabled={!canWrite || status === "completed"}
                    onChange={(e) => {
                      const next = [...attributes];
                      const subs = [...attr.subgroups];
                      subs[si] = { ...sg, label: e.target.value };
                      next[ai] = { ...attr, subgroups: subs };
                      setAttributes(next);
                    }}
                  />
                  <Input
                    className="w-28"
                    type="number"
                    step="0.01"
                    placeholder={t("value")}
                    value={sg.value}
                    disabled={!canWrite || status === "completed"}
                    onChange={(e) => {
                      const next = [...attributes];
                      const subs = [...attr.subgroups];
                      subs[si] = { ...sg, value: e.target.value };
                      next[ai] = { ...attr, subgroups: subs };
                      setAttributes(next);
                    }}
                  />
                </div>
              ))}

              <div className="flex items-center justify-between text-sm">
                {canWrite && status !== "completed" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const next = [...attributes];
                      next[ai] = {
                        ...attr,
                        subgroups: [
                          ...attr.subgroups,
                          { label: "", value: "" },
                        ],
                      };
                      setAttributes(next);
                    }}
                  >
                    {t("addSubgroup")}
                  </Button>
                )}
                <span className="ml-auto">
                  {t("ratio")}:{" "}
                  {ratio == null ? (
                    <span className="text-tertiary">{t("notComputable")}</span>
                  ) : (
                    <span
                      className={
                        ratio >= FAIRNESS_THRESHOLD
                          ? "text-emerald-600"
                          : "text-red-600"
                      }
                    >
                      {ratio.toFixed(2)} —{" "}
                      {ratio >= FAIRNESS_THRESHOLD ? t("pass") : t("fail")}
                    </span>
                  )}
                </span>
              </div>
            </div>
          );
        })}

        {canWrite && status !== "completed" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setAttributes([
                ...attributes,
                {
                  name: "",
                  metric: "selection_rate",
                  subgroups: [{ label: "", value: "" }],
                },
              ])
            }
          >
            {t("addAttribute")}
          </Button>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm space-y-1">
            <span>{t("proxyReview")}</span>
            <select
              className="w-full rounded border border-border-default bg-muted p-1"
              value={proxyReview}
              disabled={!canWrite || status === "completed"}
              onChange={(e) => setProxyReview(e.target.value as Check)}
            >
              <option value="">—</option>
              {CHECKS.map((c) => (
                <option key={c} value={c}>
                  {t(`check.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span>{t("feedbackLoop")}</span>
            <select
              className="w-full rounded border border-border-default bg-muted p-1"
              value={feedbackLoop}
              disabled={!canWrite || status === "completed"}
              onChange={(e) => setFeedbackLoop(e.target.value as Check)}
            >
              <option value="">—</option>
              {CHECKS.map((c) => (
                <option key={c} value={c}>
                  {t(`check.${c}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {canWrite && (
          <div className="flex gap-2">
            {status !== "completed" && (
              <>
                <Button
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      usecaseId,
                      proxyReview: proxyReview === "" ? null : proxyReview,
                      feedbackLoop: feedbackLoop === "" ? null : feedbackLoop,
                      attributes: attributes.map((a) => ({
                        name: a.name,
                        metric: a.metric,
                        subgroups: a.subgroups.map((s) => ({
                          label: s.label,
                          value: Number(s.value),
                        })),
                      })),
                    })
                  }
                >
                  {t("save")}
                </Button>
                <Button
                  variant="secondary"
                  disabled={complete.isPending}
                  onClick={() => complete.mutate({ usecaseId })}
                >
                  {t("complete")}
                </Button>
              </>
            )}
            {status === "completed" && (
              <Button
                variant="secondary"
                disabled={reopen.isPending}
                onClick={() => reopen.mutate({ usecaseId })}
              >
                {t("reopen")}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
