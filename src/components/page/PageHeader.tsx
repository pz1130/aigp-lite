import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface PageHeaderProps {
  breadcrumb?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({
  breadcrumb,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 pb-6 border-b border-border-default/50">
      {breadcrumb && (
        <nav className="group/bc inline-flex items-center gap-1 text-[11px] text-tertiary hover:text-secondary transition-colors">
          <ChevronRight size={11} className="text-border-default rotate-180" />
          <span className="[&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-border-default/40 [&_a]:hover:decoration-accent [&_a]:hover:text-accent">
            {breadcrumb}
          </span>
        </nav>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-0.5">
          <h1 className="text-[24px] font-bold tracking-tight text-primary leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-[13px] text-secondary/80 leading-relaxed max-w-[65ch]">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex shrink-0 items-center gap-2 pt-1">{action}</div>
        )}
      </div>
    </header>
  );
}
