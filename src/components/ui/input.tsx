import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./_utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "block w-full rounded-md border bg-surface px-3 h-9 text-body text-primary placeholder:text-tertiary",
        "border-border-default focus-visible:border-accent",
        invalid && "border-danger focus-visible:border-danger",
        "disabled:bg-muted disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";
