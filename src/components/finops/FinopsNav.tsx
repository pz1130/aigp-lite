"use client";
import { Link, usePathname } from "@/i18n/routing";

interface Labels {
  costs: string;
  budgets: string;
  pricing: string;
  providers: string;
}

const TABS = [
  { key: "costs", href: "/finops/costs" },
  { key: "budgets", href: "/finops/budgets" },
  { key: "pricing", href: "/finops/pricing" },
] as const;

export function FinopsNav({ labels }: { labels: Labels }) {
  const path = usePathname();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
      <nav className="flex gap-1 text-sm">
        {TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`rounded px-3 py-1 ${
                active
                  ? "bg-zinc-900 text-white"
                  : "text-secondary hover:bg-muted"
              }`}
            >
              {labels[t.key]}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/integrations/providers"
        className="text-xs text-accent underline"
      >
        {labels.providers} →
      </Link>
    </div>
  );
}
