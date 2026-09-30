"use client";
import * as T from "@radix-ui/react-tooltip";
import { forwardRef, type ReactNode } from "react";
import { cn } from "./_utils/cn";

export const TooltipProvider = T.Provider;
export const TooltipRoot = T.Root;
export const TooltipTrigger = T.Trigger;

export const TooltipContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof T.Content>
>(({ className, sideOffset = 4, ...rest }, ref) => (
  <T.Portal>
    <T.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 rounded bg-primary px-2 py-1 text-xs text-inverse shadow-sm",
        className,
      )}
      {...rest}
    />
  </T.Portal>
));
TooltipContent.displayName = "TooltipContent";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  );
}
