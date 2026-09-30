import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface FormLayoutProps {
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel: string;
  cancelLabel: string;
}

export function FormLayout({
  children,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  cancelLabel,
}: FormLayoutProps) {
  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-xl">
      <div className="space-y-4">{children}</div>
      <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between border-t border-border-default bg-app/95 px-6 py-3 backdrop-blur">
        <Button variant="ghost" type="button" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
