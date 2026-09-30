import {
  forwardRef,
  type HTMLAttributes,
  type ThHTMLAttributes,
  type TdHTMLAttributes,
} from "react";
import { cn } from "./_utils/cn";

export const Table = forwardRef<
  HTMLTableElement,
  HTMLAttributes<HTMLTableElement>
>(({ className, ...rest }, ref) => (
  <div className="w-full overflow-x-auto rounded-xl border border-border-default/30 bg-surface/40 backdrop-blur-md shadow-md">
    <table
      ref={ref}
      className={cn("w-full border-collapse text-body text-left", className)}
      {...rest}
    />
  </div>
));
Table.displayName = "Table";

export const THead = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...rest }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-muted/40 border-b border-border-default/40 backdrop-blur-md",
      className,
    )}
    {...rest}
  />
));
THead.displayName = "THead";

export const TBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...rest }, ref) => (
  <tbody
    ref={ref}
    className={cn("divide-y divide-border-default/20", className)}
    {...rest}
  />
));
TBody.displayName = "TBody";

export const Tr = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement>
>(({ className, ...rest }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "group h-12 transition-all duration-300 ease-out border-b border-border-default/20",
      "hover:bg-muted/50 hover:translate-x-1 hover:backdrop-blur-md",
      className,
    )}
    {...rest}
  />
));
Tr.displayName = "Tr";

export const Th = forwardRef<
  HTMLTableCellElement,
  ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...rest }, ref) => (
  <th
    ref={ref}
    scope="col"
    className={cn(
      "h-10 px-4 align-middle text-xs font-semibold uppercase tracking-wider text-secondary whitespace-nowrap",
      className,
    )}
    {...rest}
  />
));
Th.displayName = "Th";

export const Td = forwardRef<
  HTMLTableCellElement,
  TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...rest }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-4 py-3 align-middle transition-colors duration-200",
      className,
    )}
    {...rest}
  />
));
Td.displayName = "Td";
