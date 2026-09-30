"use client";
import * as RadixSwitch from "@radix-ui/react-switch";
import { forwardRef } from "react";
import { cn } from "./_utils/cn";

export const Switch = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof RadixSwitch.Root>
>(({ className, ...rest }, ref) => (
  <RadixSwitch.Root
    ref={ref}
    className={cn(
      "relative inline-flex h-5 w-9 items-center rounded-full bg-muted transition-colors",
      "data-[state=checked]:bg-accent",
      "disabled:opacity-60",
      className,
    )}
    {...rest}
  >
    <RadixSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
  </RadixSwitch.Root>
));
Switch.displayName = "Switch";
