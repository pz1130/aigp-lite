"use client";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "./_utils/cn";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export const DialogContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Content>
>(({ className, children, ...rest }, ref) => (
  <RadixDialog.Portal>
    <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-fade-in-up" />
    <RadixDialog.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
        "rounded-xl border border-border-default/60 bg-surface p-6 shadow-xl",
        "data-[state=open]:animate-fade-in-up",
        className,
      )}
      {...rest}
    >
      {children}
      <RadixDialog.Close className="absolute right-4 top-4 rounded-md p-1.5 text-tertiary/60 hover:bg-muted hover:text-primary transition-colors">
        <X size={15} strokeWidth={1.5} />
      </RadixDialog.Close>
    </RadixDialog.Content>
  </RadixDialog.Portal>
));
DialogContent.displayName = "DialogContent";

export const DialogTitle = forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...rest }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={cn(
      "text-[17px] font-semibold tracking-tight text-primary",
      className,
    )}
    {...rest}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(({ className, ...rest }, ref) => (
  <RadixDialog.Description
    ref={ref}
    className={cn("text-[13px] text-secondary mt-1 leading-relaxed", className)}
    {...rest}
  />
));
DialogDescription.displayName = "DialogDescription";
