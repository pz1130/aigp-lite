"use client";
import * as RadixSelect from "@radix-ui/react-select";
import { forwardRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "./_utils/cn";

export const Select = RadixSelect.Root;
export const SelectValue = RadixSelect.Value;

export const SelectTrigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Trigger>
>(({ className, children, ...rest }, ref) => (
  <RadixSelect.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border-default bg-surface px-3 text-body text-primary whitespace-nowrap overflow-hidden text-left",
      "hover:bg-muted data-[state=open]:border-accent [&>span]:line-clamp-1 [&>span]:truncate [&>span]:text-left",
      "disabled:opacity-60",
      className,
    )}
    {...rest}
  >
    {children}
    <RadixSelect.Icon className="shrink-0">
      <ChevronDown size={14} strokeWidth={1.5} className="text-tertiary" />
    </RadixSelect.Icon>
  </RadixSelect.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Content>
>(({ className, children, ...rest }, ref) => (
  <RadixSelect.Portal>
    <RadixSelect.Content
      ref={ref}
      position="popper"
      sideOffset={4}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border-default bg-surface text-primary shadow-md",
        className,
      )}
      {...rest}
    >
      <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
    </RadixSelect.Content>
  </RadixSelect.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectItem = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Item>
>(({ className, children, ...rest }, ref) => (
  <RadixSelect.Item
    ref={ref}
    className={cn(
      "relative flex h-8 items-center rounded px-2 pr-7 text-body outline-none",
      "data-[highlighted]:bg-muted data-[state=checked]:text-accent",
      className,
    )}
    {...rest}
  >
    <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    <RadixSelect.ItemIndicator className="absolute right-2 inline-flex items-center">
      <Check size={14} strokeWidth={1.5} />
    </RadixSelect.ItemIndicator>
  </RadixSelect.Item>
));
SelectItem.displayName = "SelectItem";
