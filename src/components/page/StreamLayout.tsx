import { type ReactNode } from "react";

interface StreamLayoutProps {
  input: ReactNode;
  output: ReactNode;
  status: ReactNode;
}

export function StreamLayout({ input, output, status }: StreamLayoutProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3 space-y-4">
        {input}
        <div className="rounded-lg border border-border-default bg-subtle p-4 font-mono text-small min-h-[200px] whitespace-pre-wrap">
          {output}
        </div>
      </div>
      <div className="lg:col-span-2">{status}</div>
    </div>
  );
}
