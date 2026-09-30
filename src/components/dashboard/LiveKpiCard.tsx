"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { KpiCard } from "./KpiCard";

type KpiKind = "calls" | "blocked" | "spend" | "maturity";

const TONES: Record<KpiKind, "accent" | "success" | "warn" | "danger"> = {
  calls: "accent",
  blocked: "warn",
  spend: "accent",
  maturity: "success",
};

export function LiveKpiCard({ kind }: { kind: KpiKind }) {
  const t = useTranslations("dashboard");
  const kpis = trpc.governance.kpis.useQuery();
  const score = trpc.governance.score.useQuery();

  if (kind === "maturity") {
    if (score.isLoading || !score.data) {
      return (
        <KpiCard
          label={t("kpi.maturity")}
          value="—"
          series={[0, 0, 0, 0, 0, 0, 0]}
          tone="success"
        />
      );
    }
    const { overall, dimensions } = score.data;
    // Build a simple series from dimension scores for the sparkline
    const dimSeries = dimensions.map((d) => d.score);
    // Pad or truncate to 7
    const series = [...dimSeries, ...Array(7).fill(0)].slice(0, 7);
    return (
      <KpiCard
        label={t("kpi.maturity")}
        value={`${overall}/100`}
        series={series}
        tone="success"
      />
    );
  }

  if (kpis.isLoading || !kpis.data) {
    return (
      <KpiCard
        label={t(`kpi.${kind}`)}
        value="—"
        series={[0, 0, 0, 0, 0, 0, 0]}
        tone={TONES[kind]}
      />
    );
  }

  const data = kpis.data[kind];
  const value =
    kind === "spend"
      ? `$${data.total.toFixed(2)}`
      : data.total.toLocaleString();

  return (
    <KpiCard
      label={t(`kpi.${kind}`)}
      value={value}
      series={data.series}
      tone={TONES[kind]}
    />
  );
}
