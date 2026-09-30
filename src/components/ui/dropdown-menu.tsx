"use client";
import * as DM from "@radix-ui/react-dropdown-menu";
import { forwardRef } from "react";
import { cn } from "./_utils/cn";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.Content>
>(({ className, sideOffset = 4, ...rest }, ref) => (
  <DM.Portal>
    <DM.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[10rem] overflow-hidden rounded-md border border-border-default bg-surface p-1 text-primary shadow-md",
        className,
      )}
      {...rest}
    />
  </DM.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.Item>
>(({ className, ...rest }, ref) => (
  <DM.Item
    ref={ref}
    className={cn(
      "relative flex h-8 cursor-default select-none items-center gap-2 rounded px-2 text-body outline-none",
      "data-[highlighted]:bg-muted",
      "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none",
      className,
    )}
    {...rest}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.Separator>
>(({ className, ...rest }, ref) => (
  <DM.Separator
    ref={ref}
    className={cn("my-1 h-px bg-border-default", className)}
    {...rest}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";
