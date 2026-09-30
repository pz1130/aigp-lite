import { AlertOctagon } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Retry",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex min-h-60 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-danger p-8 text-center"
    >
      <Icon icon={AlertOctagon} size={48} className="text-danger" />
      <h2 className="text-h3 mt-2">{title}</h2>
      {description && (
        <p className="max-w-[60ch] text-secondary text-small font-mono">
          {description}
        </p>
      )}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-3">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
