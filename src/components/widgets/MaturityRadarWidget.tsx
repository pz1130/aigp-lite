"use client";
import { trpc } from "@/lib/trpc/client";
import { PILLARS } from "@/lib/maturity/pillars";

const _PILLAR_ICONS = {
  governance: ["shield", "check-circle", "shield-check"],
  risk: ["alert-triangle", "activity", "bar-chart-2"],
  compliance: ["file-check", "clipboard-check", "award"],
  security: ["lock", "eye", "shield-off"],
  data: ["database", "layers", "git-branch"],
} as const;

function scoreColor(pct: number) {
  if (pct >= 75) return "bg-success";
  if (pct >= 50) return "bg-accent";
  if (pct >= 30) return "bg-warn";
  return "bg-danger";
}

export function MaturityRadarWidget() {
  const { data, isLoading } = trpc.maturity.dashboardSummary.useQuery();

  if (isLoading)
    return (
      <div className="rounded-lg border border-border-default/50 bg-surface p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    );

  const pillars = PILLARS.map((p) => ({
    name: p,
    score: data?.[p]?.scoreInt ?? 0,
    max: data?.[p]?.maxScore ?? 1,
    pct: data?.[p]
      ? Math.round((data[p].scoreInt / data[p].maxScore) * 100)
      : 0,
  }));

  const overall = Math.round(
    pillars.reduce((a, b) => a + b.pct, 0) / pillars.length,
  );

  return (
    <div className="rounded-lg border border-border-default/50 bg-surface p-4 space-y-4">
      {/* Overall score header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary/60">
            Overall Score
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[28px] font-bold tracking-tight text-primary">
              {overall}
            </span>
            <span className="text-[13px] text-tertiary">/ 100</span>
          </div>
        </div>
        {/* Score ring */}
        <div className="relative w-12 h-12 shrink-0">
          <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="var(--border-default)"
              strokeWidth="3"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke={
                overall >= 75
                  ? "var(--success)"
                  : overall >= 50
                    ? "var(--accent)"
                    : "var(--warn)"
              }
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${overall * 1.256} 125.6`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-primary">
            {overall}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border-default/40" />

      {/* Pillars */}
      <div className="space-y-3">
        {pillars.map((p) => (
          <div key={p.name} className="group">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-medium text-primary capitalize">
                {p.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-secondary">
                  {p.score}/{p.max}
                </span>
                <span
                  className={`text-[11px] font-semibold ${p.pct >= 75 ? "text-success" : p.pct >= 50 ? "text-accent" : p.pct >= 30 ? "text-warn" : "text-danger"}`}
                >
                  {p.pct}%
                </span>
              </div>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out group-hover:opacity-80 ${scoreColor(p.pct)}`}
                style={{ width: `${p.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
