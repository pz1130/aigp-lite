import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./_utils/cn";

const badgeStyles = cva("inline-flex items-center rounded-full font-medium", {
  variants: {
    variant: {
      neutral: "bg-muted text-secondary",
      info: "bg-accent-subtle text-accent",
      success: "bg-success-subtle text-success",
      warn: "bg-warn-subtle text-warn",
      danger: "bg-danger-subtle text-danger",
      critical: "bg-danger-subtle text-severity-critical font-semibold",
    },
    size: {
      sm: "h-[18px] px-1.5 text-[11px]",
      md: "h-[22px] px-2 text-xs",
      lg: "h-7 px-2.5 text-small",
    },
  },
  defaultVariants: { variant: "neutral", size: "md" },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeStyles> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...rest }, ref) => (
    <span
      ref={ref}
      className={cn(badgeStyles({ variant, size }), className)}
      {...rest}
    />
  ),
);
Badge.displayName = "Badge";
