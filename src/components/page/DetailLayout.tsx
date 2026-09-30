import { type ReactNode } from "react";

interface DetailLayoutProps {
  main: ReactNode;
  aside?: ReactNode;
}

export function DetailLayout({ main, aside }: DetailLayoutProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">{main}</div>
      {aside && (
        <aside className="lg:sticky lg:top-6 lg:self-start">{aside}</aside>
      )}
    </div>
  );
}
