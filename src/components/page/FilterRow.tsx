import { type ReactNode } from "react";

interface FilterRowProps {
  left: ReactNode;
  right?: ReactNode;
}

export function FilterRow({ left, right }: FilterRowProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
