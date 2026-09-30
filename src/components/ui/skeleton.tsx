import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./_utils/cn";

export const Skeleton = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, ref) => (
  <div
    ref={ref}
    aria-hidden="true"
    className={cn("animate-pulse rounded bg-muted", className)}
    {...rest}
  />
));
Skeleton.displayName = "Skeleton";
