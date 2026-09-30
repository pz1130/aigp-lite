import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import type { ReadinessEvaluation } from "@/lib/dossier/types";

const STATUS_STYLE: Record<string, string> = {
  pass: "text-green-700 bg-green-50 border-green-200",
  warn: "text-amber-700 bg-amber-50 border-amber-200",
  fail: "text-red-700 bg-red-50 border-red-200",
  na: "text-gray-500 bg-gray-50 border-gray-200",
};

// Most checks carry a single numeric field in `metric`, so picking "the
// first number" is sufficient for the detail string's `{count}`. A few
// checks (e.g. `regulatory_risks`) carry more than one numeric field — for
// those, name the field that actually matches the i18n message explicitly.
const COUNT_FIELD: Record<string, string> = {
  regulatory_risks: "withoutRationale",
};

function detailCount(id: string, metric: Record<string, unknown>): number {
  const namedField = COUNT_FIELD[id];
  if (namedField && typeof metric[namedField] === "number") {
    return metric[namedField] as number;
  }
  const firstNumeric = Object.values(metric).find((v) => typeof v === "number");
  return Number(firstNumeric ?? 0);
}

export async function ReadinessChecklist({
  readiness,
}: {
  readiness: ReadinessEvaluation;
}) {
  const t = await getTranslations("dossier");
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {readiness.checks.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{t(`checks.${c.id}.label`)}</span>
              <span className="text-xs text-gray-400">
                {t(`severity.${c.severity}`)}
              </span>
              {typeof c.metric.requiredAtTier === "number" && (
                <span className="text-xs text-amber-700">
                  {t("requiredAtTier", { tier: c.metric.requiredAtTier })}
                </span>
              )}
            </div>
            <p className="truncate text-sm text-gray-500">
              {t(`checks.${c.id}.detail`, {
                count: detailCount(c.id, c.metric),
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className={`rounded border px-2 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}
            >
              {t(`status.${c.status}`)}
            </span>
            <Link
              href={c.deepLink as Parameters<typeof Link>[0]["href"]}
              className="text-xs text-blue-600 hover:underline"
            >
              {t("open")}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
