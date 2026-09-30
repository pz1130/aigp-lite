"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function MergedIntoBanner({ targetId }: { targetId: string }) {
  const t = useTranslations("incident.automation");
  return (
    <div className="mb-4 rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
      {t("merged_into")}{" "}
      <Link href={`./${targetId}`} className="font-medium underline">
        #{targetId.slice(0, 7)}
      </Link>
    </div>
  );
}
