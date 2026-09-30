import type {
  VendorType,
  VendorRiskRating,
  DueDiligenceStatus,
} from "@/lib/prisma";
import {
  applicableItems,
  type AnswerLite,
  DUE_DILIGENCE_CATALOG,
} from "./catalog";

const WEIGHT: Record<DueDiligenceStatus, number> = {
  yes: 1,
  partial: 0.5,
  no: 0,
  not_applicable: 0,
};

export const RATING_SCORE: Record<VendorRiskRating, number> = {
  low: 100,
  medium: 67,
  high: 33,
  critical: 0,
};

/** 0-100 weighted coverage over applicable items; unanswered applicable items count as 0. */
export function scoreCoverage(
  vendorType: VendorType,
  answers: AnswerLite[],
): number {
  const items = applicableItems(vendorType, answers);
  if (items.length === 0) return 100; // everything N/A — nothing left to assess
  const byCode = new Map(answers.map((a) => [a.itemCode, a.status]));
  let sum = 0;
  for (const item of items) {
    const status = byCode.get(item.code);
    sum += status ? WEIGHT[status] : 0;
  }
  return Math.round((sum / items.length) * 100);
}

/** True when any applicable critical item is explicitly answered "no". */
function hasCriticalGap(
  vendorType: VendorType,
  answers: AnswerLite[],
): boolean {
  const items = applicableItems(vendorType, answers);
  const criticalCodes = new Set(
    DUE_DILIGENCE_CATALOG.filter((i) => i.severity === "critical").map(
      (i) => i.code,
    ),
  );
  const byCode = new Map(answers.map((a) => [a.itemCode, a.status]));
  return items.some(
    (item) => criticalCodes.has(item.code) && byCode.get(item.code) === "no",
  );
}

export function computeRating(
  vendorType: VendorType,
  answers: AnswerLite[],
): VendorRiskRating {
  const coverage = scoreCoverage(vendorType, answers);
  let rating: VendorRiskRating =
    coverage >= 85
      ? "low"
      : coverage >= 60
        ? "medium"
        : coverage >= 35
          ? "high"
          : "critical";
  if (
    hasCriticalGap(vendorType, answers) &&
    (rating === "low" || rating === "medium")
  ) {
    rating = "high";
  }
  return rating;
}

export function effectiveRating(v: {
  computedRating: VendorRiskRating | null;
  ratingOverride: VendorRiskRating | null;
}): VendorRiskRating | null {
  return v.ratingOverride ?? v.computedRating;
}
