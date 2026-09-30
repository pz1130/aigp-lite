import { type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { type ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-default p-8 text-center">
      <Icon icon={icon} size={48} className="text-tertiary" />
      <h2 className="text-h3 mt-2">{title}</h2>
      {description && (
        <p className="max-w-[60ch] text-secondary text-small">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
