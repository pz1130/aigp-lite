import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./_utils/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "block w-full rounded-md border bg-surface px-3 py-2 text-body text-primary placeholder:text-tertiary",
        "border-border-default focus-visible:border-accent",
        invalid && "border-danger focus-visible:border-danger",
        "disabled:bg-muted disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  ),
);
Textarea.displayName = "Textarea";
