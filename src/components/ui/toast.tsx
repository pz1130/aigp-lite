"use client";
import * as RT from "@radix-ui/react-toast";
import { forwardRef } from "react";
import { cn } from "./_utils/cn";

export const ToastProvider = RT.Provider;

export const ToastViewport = forwardRef<
  HTMLOListElement,
  React.ComponentPropsWithoutRef<typeof RT.Viewport>
>(({ className, ...rest }, ref) => (
  <RT.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-4 right-4 z-50 flex w-96 flex-col gap-2",
      className,
    )}
    {...rest}
  />
));
ToastViewport.displayName = "ToastViewport";

export const Toast = forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<typeof RT.Root> & {
    variant?: "default" | "success" | "warn" | "danger";
  }
>(({ className, variant = "default", ...rest }, ref) => (
  <RT.Root
    ref={ref}
    className={cn(
      "rounded-md border bg-surface p-3 shadow-md",
      variant === "default" && "border-border-default",
      variant === "success" && "border-success bg-success-subtle",
      variant === "warn" && "border-warn bg-warn-subtle",
      variant === "danger" && "border-danger bg-danger-subtle",
      className,
    )}
    {...rest}
  />
));
Toast.displayName = "Toast";

export const ToastTitle = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof RT.Title>
>(({ className, ...rest }, ref) => (
  <RT.Title ref={ref} className={cn("text-h3 mb-0.5", className)} {...rest} />
));
ToastTitle.displayName = "ToastTitle";

export const ToastDescription = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof RT.Description>
>(({ className, ...rest }, ref) => (
  <RT.Description
    ref={ref}
    className={cn("text-secondary text-small", className)}
    {...rest}
  />
));
ToastDescription.displayName = "ToastDescription";
