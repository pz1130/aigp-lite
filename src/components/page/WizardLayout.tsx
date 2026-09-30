import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/_utils/cn";
import { Check } from "lucide-react";

interface Step {
  label: string;
  status: "complete" | "current" | "upcoming";
}

interface WizardLayoutProps {
  steps: Step[];
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  onCancel?: () => void;
  nextLabel: string;
  backLabel: string;
  cancelLabel: string;
  isLastStep?: boolean;
  submitting?: boolean;
}

export function WizardLayout({
  steps,
  children,
  onBack,
  onNext,
  onCancel,
  nextLabel,
  backLabel,
  cancelLabel,
  isLastStep,
  submitting,
}: WizardLayoutProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-6 flex items-center gap-4 text-small">
        {steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              "flex items-center gap-2",
              s.status === "current" && "text-accent font-medium",
              s.status === "complete" && "text-success",
              s.status === "upcoming" && "text-tertiary",
            )}
          >
            <span
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full border",
                s.status === "current" &&
                  "border-accent bg-accent text-inverse",
                s.status === "complete" &&
                  "border-success bg-success text-inverse",
                s.status === "upcoming" && "border-border-default",
              )}
            >
              {s.status === "complete" ? (
                <Check size={12} strokeWidth={2} />
              ) : (
                i + 1
              )}
            </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="space-y-4">{children}</div>
      <div className="mt-6 flex items-center justify-between border-t border-border-default pt-4">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="secondary" onClick={onBack}>
              {backLabel}
            </Button>
          )}
          <Button onClick={onNext} disabled={submitting}>
            {isLastStep ? nextLabel : `${nextLabel} →`}
          </Button>
        </div>
      </div>
    </div>
  );
}
