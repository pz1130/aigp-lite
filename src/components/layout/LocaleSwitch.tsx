"use client";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
import { cn } from "@/components/ui/_utils/cn";

const LOCALES = [
  { code: "en", label: "EN" },
  { code: "zh", label: "ZH" },
] as const;

export function LocaleSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted">
      {LOCALES.map(({ code, label }) => (
        <button
          key={code}
          onClick={() =>
            router.replace(pathname, { locale: code as "en" | "zh" })
          }
          className={cn(
            "h-6 px-2 text-[11px] font-semibold rounded transition-all duration-150",
            locale === code
              ? "bg-surface text-primary shadow-sm"
              : "text-tertiary hover:text-secondary",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
