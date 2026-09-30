import type { FairnessMetricKind, FairnessCheck } from "@/lib/prisma";

export const FAIRNESS_THRESHOLD = 0.8; // four-fifths rule

export const METRIC_DIRECTION: Record<
  FairnessMetricKind,
  "higher_better" | "lower_better"
> = {
  selection_rate: "higher_better",
  true_positive_rate: "higher_better",
  precision: "higher_better",
  error_rate: "lower_better",
};

export interface SubgroupLite {
  label: string;
  value: number;
}

export interface AttributeLite {
  name: string;
  metric: FairnessMetricKind;
  subgroups: SubgroupLite[];
}

export function disparityRatio(attr: AttributeLite): number | null {
  const vals = attr.subgroups
    .map((s) => s.value)
    .filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  if (max === 0) return null;
  return min / max;
}

export function attributePasses(attr: AttributeLite): boolean | null {
  const ratio = disparityRatio(attr);
  if (ratio == null) return null;
  return ratio >= FAIRNESS_THRESHOLD;
}

export function hasDisparity(attributes: AttributeLite[]): boolean {
  return attributes.some((a) => attributePasses(a) === false);
}

export function canComplete(args: {
  attributes: AttributeLite[];
  proxyReview: FairnessCheck | null;
  feedbackLoop: FairnessCheck | null;
}): boolean {
  const hasComputable = args.attributes.some((a) => disparityRatio(a) != null);
  return hasComputable && args.proxyReview != null && args.feedbackLoop != null;
}

export interface FairnessSummary {
  attributesAssessed: number;
  attributesFailing: number;
  worstRatio: number | null;
  proxyReview: FairnessCheck | null;
  feedbackLoop: FairnessCheck | null;
}

export function fairnessSummary(args: {
  attributes: AttributeLite[];
  proxyReview: FairnessCheck | null;
  feedbackLoop: FairnessCheck | null;
}): FairnessSummary {
  const ratios = args.attributes
    .map((a) => disparityRatio(a))
    .filter((r): r is number => r != null);
  const failing = args.attributes.filter(
    (a) => attributePasses(a) === false,
  ).length;
  return {
    attributesAssessed: args.attributes.length,
    attributesFailing: failing,
    worstRatio: ratios.length === 0 ? null : Math.min(...ratios),
    proxyReview: args.proxyReview,
    feedbackLoop: args.feedbackLoop,
  };
}
