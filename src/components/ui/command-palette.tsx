"use client";
import { Command } from "cmdk";
import { forwardRef, type ReactNode, useEffect } from "react";
import { Dialog, DialogContent } from "./dialog";
import { Search } from "lucide-react";
import { cn } from "./_utils/cn";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  children: ReactNode;
}

export function CommandPalette({
  open,
  onOpenChange,
  placeholder = "Type a command or search…",
  children,
}: CommandPaletteProps) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <Command className="w-full [&_[cmdk-input-wrapper]]:px-4 [&_[cmdk-input-wrapper]]:h-12 [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input]]:text-[14px]">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border-default/50 px-4 h-12">
            <Search
              size={16}
              strokeWidth={1.5}
              className="text-tertiary shrink-0"
            />
            <Command.Input
              placeholder={placeholder}
              className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-tertiary"
            />
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border-default bg-muted px-1.5 text-[10px] text-tertiary font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[420px] overflow-y-auto py-2 px-2">
            {children}
            <Command.Empty className="py-8 text-center text-[13px] text-tertiary">
              No results found.
            </Command.Empty>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export const CommandGroup = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Command.Group>
>(({ className, ...rest }, ref) => (
  <Command.Group
    ref={ref}
    className={cn(
      "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-tertiary/60",
      className,
    )}
    {...rest}
  />
));
CommandGroup.displayName = "CommandGroup";

export const CommandItem = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Command.Item>
>(({ className, ...rest }, ref) => (
  <Command.Item
    ref={ref}
    className={cn(
      "relative flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] text-secondary outline-none transition-colors",
      "data-[selected=true]:bg-muted/80 data-[selected=true]:text-primary",
      "hover:text-primary",
      className,
    )}
    {...rest}
  />
));
CommandItem.displayName = "CommandItem";

export const CommandEmpty = Command.Empty;
