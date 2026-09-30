"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

type Tier = "minimal" | "limited" | "high" | "critical";
const DIM_KEYS = [
  "affectedParties",
  "decisionConsequence",
  "financialSafety",
  "dataSensitivity",
] as const;
type DimKey = (typeof DIM_KEYS)[number];

const TIER_COLOR: Record<Tier, string> = {
  minimal: "bg-gray-100 text-gray-700",
  limited: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

export function UsecaseMaterialityCard({
  usecaseId,
  canWrite,
}: {
  usecaseId: string;
  canWrite: boolean;
}) {
  const t = useTranslations("materiality");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.materiality.get.useQuery({ usecaseId });
  const [editing, setEditing] = useState(false);
  const [inputs, setInputs] = useState<Record<DimKey, number>>({
    affectedParties: 0,
    decisionConsequence: 0,
    financialSafety: 0,
    dataSensitivity: 0,
  });

  const upsert = trpc.materiality.upsert.useMutation({
    async onSuccess() {
      setEditing(false);
      await utils.materiality.get.invalidate({ usecaseId });
    },
  });

  function startEdit() {
    if (data) {
      setInputs({
        affectedParties: data.affectedParties,
        decisionConsequence: data.decisionConsequence,
        financialSafety: data.financialSafety,
        dataSensitivity: data.dataSensitivity,
      });
    }
    setEditing(true);
  }

  const effective: Tier | null = data
    ? ((data.tierOverride ?? data.computedTier) as Tier)
    : null;

  return (
    <section className="rounded-lg border border-border-default bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-primary">{t("title")}</h2>
          <p className="text-sm text-secondary">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2">
          {effective && (
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${TIER_COLOR[effective]}`}
            >
              {t(`tier.${effective}`)}
            </span>
          )}
          {canWrite && !editing && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={startEdit}
            >
              {data ? t("edit") : t("assess")}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-secondary">{t("loading")}</p>
      ) : editing ? (
        <div className="space-y-4">
          {DIM_KEYS.map((key) => (
            <label key={key} className="block text-sm">
              <span className="text-xs text-tertiary">{t(`dim.${key}`)}</span>
              <select
                className="mt-1 w-full rounded border border-border-default bg-muted p-2 text-sm"
                value={inputs[key]}
                onChange={(e) =>
                  setInputs({ ...inputs, [key]: Number(e.target.value) })
                }
              >
                {[0, 1, 2, 3].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => upsert.mutate({ usecaseId, inputs })}
              disabled={upsert.isPending}
            >
              {t("save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : !data ? (
        <p className="text-sm text-tertiary">{t("empty")}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {DIM_KEYS.map((key) => (
              <div key={key}>
                <div className="text-xs text-tertiary">{t(`dim.${key}`)}</div>
                <div className="font-medium text-primary">{data[key]}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-tertiary">{t("computed")}:</span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${TIER_COLOR[data.computedTier as Tier]}`}
            >
              {t(`tier.${data.computedTier}`)}
            </span>
            {data.tierOverride && (
              <>
                <span className="text-xs text-tertiary">{t("override")}:</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${TIER_COLOR[data.tierOverride as Tier]}`}
                >
                  {t(`tier.${data.tierOverride}`)}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
