"use client";
import * as P from "@radix-ui/react-popover";
import { forwardRef } from "react";
import { cn } from "./_utils/cn";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export const PopoverContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof P.Content>
>(({ className, sideOffset = 8, ...rest }, ref) => (
  <P.Portal>
    <P.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-80 rounded-lg border border-border-default/70 bg-surface",
        "shadow-lg shadow-black/10",
        "data-[state=open]:animate-fade-in-up",
        "data-[side=bottom]:slide-in-from-top-2",
        "data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...rest}
    />
  </P.Portal>
));
PopoverContent.displayName = "PopoverContent";
