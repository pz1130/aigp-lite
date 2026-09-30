import { cn } from "./_utils/cn";

interface EmptyStateProps {
  icon?: "activity" | "inbox" | "search" | "chart" | "shield" | "file";
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const ICONS = {
  activity: (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 text-tertiary/30">
      <path
        d="M8 24 L16 24 L20 14 L24 34 L28 20 L32 28 L36 24 L40 24"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 text-tertiary/30">
      <rect
        x="6"
        y="10"
        width="36"
        height="28"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6 20 L24 28 L42 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 text-tertiary/30">
      <circle cx="20" cy="20" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M28 28 L38 38"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 text-tertiary/30">
      <rect
        x="8"
        y="26"
        width="8"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="20"
        y="18"
        width="8"
        height="22"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="32"
        y="10"
        width="8"
        height="30"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 text-tertiary/30">
      <path
        d="M24 6 L40 12 L40 26 C40 34 32 40 24 44 C16 40 8 34 8 26 L8 12 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 24 L22 30 L32 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 text-tertiary/30">
      <path
        d="M12 6 L30 6 L38 14 L38 42 L12 42 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M30 6 L30 14 L38 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M20 22 L30 22 M20 28 L28 28 M20 34 L26 34"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
};

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className,
      )}
    >
      <div className="mb-4 opacity-60">{ICONS[icon]}</div>
      <p className="text-[14px] font-medium text-secondary/80 mb-1">{title}</p>
      {description && (
        <p className="text-[12px] text-tertiary leading-relaxed max-w-[40ch]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
