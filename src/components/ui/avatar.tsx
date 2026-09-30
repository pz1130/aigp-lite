"use client";
import * as A from "@radix-ui/react-avatar";
import { forwardRef } from "react";
import { cn } from "./_utils/cn";

export const Avatar = forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof A.Root>
>(({ className, ...rest }, ref) => (
  <A.Root
    ref={ref}
    className={cn(
      "inline-flex h-8 w-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted text-[12px] font-semibold text-secondary",
      className,
    )}
    {...rest}
  />
));
Avatar.displayName = "Avatar";

export const AvatarImage = forwardRef<
  HTMLImageElement,
  React.ComponentPropsWithoutRef<typeof A.Image>
>((props, ref) => <A.Image ref={ref} {...props} />);
AvatarImage.displayName = "AvatarImage";

export const AvatarFallback = forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof A.Fallback>
>((props, ref) => (
  <A.Fallback
    ref={ref}
    className="w-full h-full flex items-center justify-center bg-muted text-secondary"
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";
