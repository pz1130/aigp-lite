import { type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/_utils/cn";
import { Link } from "@/i18n/routing";

interface AttentionCardProps {
  icon: LucideIcon;
  tone: "danger" | "warn" | "info";
  count: number;
  title: string;
  bullets?: string[];
  cta: { label: string; href: string };
}

const TONE = {
  danger: {
    border: "border-danger/30",
    bg: "bg-danger-subtle/40",
    icon: "text-danger",
    badge: "bg-danger text-white",
    label: "text-danger",
  },
  warn: {
    border: "border-warn/30",
    bg: "bg-warn-subtle/40",
    icon: "text-warn",
    badge: "bg-warn text-white",
    label: "text-warn",
  },
  info: {
    border: "border-accent/30",
    bg: "bg-accent-subtle/40",
    icon: "text-accent",
    badge: "bg-accent text-white",
    label: "text-accent",
  },
} as const;

export function AttentionCard({
  icon,
  tone,
  count,
  title,
  bullets,
  cta,
}: AttentionCardProps) {
  const s = TONE[tone];
  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3 transition-all duration-150",
        "hover:shadow-md hover:-translate-y-px cursor-default",
        `bg-gradient-to-br ${s.bg} ${s.border}`,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon={icon} size={14} className={s.icon} />
          <span className="text-[13px] font-semibold text-primary">
            {title}
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
            s.badge,
          )}
        >
          {count}
        </span>
      </div>
      {bullets && bullets.length > 0 && (
        <ul className="space-y-1">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="text-[12px] text-secondary leading-snug pl-1"
            >
              · {b}
            </li>
          ))}
        </ul>
      )}
      <div className="pt-0.5">
        <Link href={cta.href}>
          <Button
            variant="secondary"
            size="sm"
            className="text-[12px] h-7 shadow-sm"
          >
            {cta.label}
          </Button>
        </Link>
      </div>
    </div>
  );
}
