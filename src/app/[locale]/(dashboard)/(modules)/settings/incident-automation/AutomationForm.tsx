"use client";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { FormLayout } from "@/components/page";

interface ConfigState {
  autoOpenEnabled: boolean;
  blockAlwaysOpens: boolean;
  hitBurstThreshold: number;
  hitBurstWindowMin: number;
  dedupEnabled: boolean;
  dedupSimilarityThreshold: number;
  dedupLookbackDays: number;
}

const DEFAULTS: ConfigState = {
  autoOpenEnabled: false,
  blockAlwaysOpens: false,
  hitBurstThreshold: 5,
  hitBurstWindowMin: 15,
  dedupEnabled: false,
  dedupSimilarityThreshold: 0.8,
  dedupLookbackDays: 30,
};

export function AutomationForm() {
  const t = useTranslations("incident.automation");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.incidentAutomation.get.useQuery();
  const update = trpc.incidentAutomation.update.useMutation({
    onSuccess: () => utils.incidentAutomation.get.invalidate(),
  });

  const [config, setConfig] = useState<ConfigState>(DEFAULTS);

  useEffect(() => {
    if (data) {
      setConfig({
        autoOpenEnabled: data.autoOpenEnabled ?? false,
        blockAlwaysOpens: data.blockAlwaysOpens ?? false,
        hitBurstThreshold: data.hitBurstThreshold ?? 5,
        hitBurstWindowMin: data.hitBurstWindowMin ?? 15,
        dedupEnabled: data.dedupEnabled ?? false,
        dedupSimilarityThreshold: data.dedupSimilarityThreshold ?? 0.8,
        dedupLookbackDays: data.dedupLookbackDays ?? 30,
      });
    }
  }, [data]);

  function set(field: keyof ConfigState, value: boolean | number) {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate(config);
  }

  if (isLoading)
    return <div className="text-sm text-secondary py-4">Loading…</div>;

  return (
    <FormLayout
      onSubmit={handleSubmit}
      submitting={update.isPending}
      submitLabel={t("save") ?? "Save"}
      cancelLabel="Cancel"
    >
      {/* Auto-open section */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">
          Auto-open incidents
        </h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-primary"
            checked={config.autoOpenEnabled}
            onChange={(e) => set("autoOpenEnabled", e.target.checked)}
          />
          <span className="text-sm text-primary">{t("auto_open_enabled")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-primary"
            checked={config.blockAlwaysOpens}
            onChange={(e) => set("blockAlwaysOpens", e.target.checked)}
          />
          <span className="text-sm text-primary">
            {t("block_always_opens")}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase text-secondary tracking-wide">
              {t("hit_burst_threshold")}
            </span>
            <Input
              type="number"
              min={1}
              max={1000}
              value={config.hitBurstThreshold}
              onChange={(e) =>
                set("hitBurstThreshold", parseInt(e.target.value) || 1)
              }
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase text-secondary tracking-wide">
              {t("hit_burst_window_min")}
            </span>
            <Input
              type="number"
              min={1}
              max={1440}
              value={config.hitBurstWindowMin}
              onChange={(e) =>
                set("hitBurstWindowMin", parseInt(e.target.value) || 1)
              }
            />
          </label>
        </div>
      </div>

      {/* Dedup section */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">
          Semantic deduplication
        </h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-primary"
            checked={config.dedupEnabled}
            onChange={(e) => set("dedupEnabled", e.target.checked)}
          />
          <span className="text-sm text-primary">{t("dedup_enabled")}</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase text-secondary tracking-wide">
            {t("dedup_similarity_threshold")}:{" "}
            {config.dedupSimilarityThreshold.toFixed(2)}
          </span>
          <input
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={config.dedupSimilarityThreshold}
            onChange={(e) =>
              set("dedupSimilarityThreshold", parseFloat(e.target.value))
            }
            className="w-full accent-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase text-secondary tracking-wide">
            {t("dedup_lookback_days")}
          </span>
          <Input
            type="number"
            min={1}
            max={365}
            value={config.dedupLookbackDays}
            onChange={(e) =>
              set("dedupLookbackDays", parseInt(e.target.value) || 1)
            }
          />
        </label>
      </div>

      {update.isSuccess && <p className="text-sm text-success">Saved!</p>}
      {update.isError && (
        <p className="text-sm text-danger">Failed to save. Please try again.</p>
      )}
    </FormLayout>
  );
}
