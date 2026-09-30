import { forwardRef, type HTMLAttributes } from "react";
import { clsx } from "clsx";
import { cn } from "./_utils/cn";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border-default/50 bg-surface",
        "shadow-sm hover:shadow-md hover:border-border-default/80 transition-all duration-200 hover:-translate-y-px",
        className,
      )}
      {...rest}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, ref) => (
  <div
    ref={ref}
    className={cn("px-4 py-3 border-b border-border-default/40", className)}
    {...rest}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...rest }, ref) => (
  <h3
    ref={ref}
    className={clsx(
      "text-[15px] font-semibold tracking-tight text-primary",
      className,
    )}
    {...rest}
  />
));
CardTitle.displayName = "CardTitle";

export const CardBody = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, ref) => (
  <div ref={ref} className={cn("p-4", className)} {...rest} />
));
CardBody.displayName = "CardBody";

export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, ref) => (
  <div
    ref={ref}
    className={cn("px-4 py-3 border-t border-border-default/40", className)}
    {...rest}
  />
));
CardFooter.displayName = "CardFooter";
