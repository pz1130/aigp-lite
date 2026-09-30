"use client";
import * as T from "@radix-ui/react-tabs";
import { forwardRef } from "react";
import { cn } from "./_utils/cn";

export const Tabs = T.Root;

export const TabsList = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof T.List>
>(({ className, ...rest }, ref) => (
  <T.List
    ref={ref}
    className={cn(
      "flex h-10 items-center gap-1 border-b border-border-default",
      className,
    )}
    {...rest}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof T.Trigger>
>(({ className, ...rest }, ref) => (
  <T.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center px-3 text-body text-secondary",
      "data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-accent",
      className,
    )}
    {...rest}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof T.Content>
>(({ className, ...rest }, ref) => (
  <T.Content ref={ref} className={cn("pt-4", className)} {...rest} />
));
TabsContent.displayName = "TabsContent";
