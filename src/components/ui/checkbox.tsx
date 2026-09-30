"use client";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "./_utils/cn";

export const Checkbox = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof RadixCheckbox.Root>
>(({ className, ...rest }, ref) => (
  <RadixCheckbox.Root
    ref={ref}
    className={cn(
      "inline-flex h-4 w-4 items-center justify-center rounded-sm border border-border-strong bg-surface",
      "data-[state=checked]:bg-accent data-[state=checked]:border-accent",
      "disabled:opacity-60",
      className,
    )}
    {...rest}
  >
    <RadixCheckbox.Indicator>
      <Check size={12} strokeWidth={2} className="text-inverse" />
    </RadixCheckbox.Indicator>
  </RadixCheckbox.Root>
));
Checkbox.displayName = "Checkbox";
