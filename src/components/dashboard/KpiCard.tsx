import { Sparkline } from "./Sparkline";
import { cn } from "@/components/ui/_utils/cn";

interface KpiCardProps {
  label: string;
  value: string;
  series: number[];
  wow?: { delta: number; label: string };
  tone?: "accent" | "success" | "warn" | "danger";
}

const TONE = {
  accent: {
    grad: "from-accent/[0.07]",
    bar: "from-accent/25 to-transparent",
    text: "text-accent",
    dot: "bg-accent",
    glow: "hover:shadow-accent/10",
    delta: "text-accent",
  },
  success: {
    grad: "from-success/[0.07]",
    bar: "from-success/25 to-transparent",
    text: "text-success",
    dot: "bg-success",
    glow: "hover:shadow-success/10",
    delta: "text-success",
  },
  warn: {
    grad: "from-warn/[0.07]",
    bar: "from-warn/25 to-transparent",
    text: "text-warn",
    dot: "bg-warn",
    glow: "hover:shadow-warn/10",
    delta: "text-warn",
  },
  danger: {
    grad: "from-danger/[0.07]",
    bar: "from-danger/25 to-transparent",
    text: "text-danger",
    dot: "bg-danger",
    glow: "hover:shadow-danger/10",
    delta: "text-danger",
  },
} as const;

export function KpiCard({
  label,
  value,
  series,
  wow,
  tone = "accent",
}: KpiCardProps) {
  const s = TONE[tone];
  return (
    <div
      className={cn(
        "group relative rounded-lg border border-border-default/50 bg-surface overflow-hidden",
        "transition-all duration-200 hover:shadow-md hover:border-border-default/80 hover:-translate-y-px",
        "cursor-default",
        `bg-gradient-to-br ${s.grad} to-transparent`,
      )}
    >
      {/* Accent left border on hover */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-0.5 bg-transparent group-hover:bg-accent/40 transition-all duration-200",
        )}
      />

      <div className="relative p-4 space-y-3">
        {/* Label + indicator */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            {label}
          </p>
          <div
            className={cn(
              "w-2 h-2 rounded-full ring-2 ring-surface shadow-sm",
              s.dot,
            )}
          />
        </div>

        {/* Big number */}
        <div className="text-[30px] font-bold tracking-tight text-primary leading-none font-mono">
          {value}
        </div>

        {/* Sparkline with gradient area */}
        <div className={cn("pl-0.5", s.text)}>
          <Sparkline values={series} width={110} height={30} />
        </div>

        {/* Delta */}
        {wow && (
          <div className="pt-1.5 border-t border-border-default/40">
            <span
              className={cn(
                "text-[11px] font-bold",
                wow.delta >= 0 ? "text-success" : "text-danger",
              )}
            >
              {wow.delta >= 0 ? "↑" : "↓"} {Math.abs(wow.delta)}%
            </span>
            <span className="text-[11px] text-tertiary ml-1.5">
              {wow.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
