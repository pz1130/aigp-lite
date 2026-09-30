import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./_utils/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap press-effect select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg rounded-md shadow-sm",
        secondary:
          "bg-surface text-primary border border-border-default/60 rounded-md hover:bg-muted hover:border-border-default",
        ghost:
          "bg-transparent text-secondary rounded-md hover:bg-muted hover:text-primary",
        danger: "bg-danger text-inverse rounded-md hover:opacity-90",
      },
      size: {
        sm: "h-7 px-2.5 text-[12px] rounded-md",
        md: "h-8 px-3.5 text-[13px] rounded-md",
        lg: "h-10 px-4 text-[14px] rounded-md",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size }), className)}
      {...rest}
    />
  ),
);
Button.displayName = "Button";
