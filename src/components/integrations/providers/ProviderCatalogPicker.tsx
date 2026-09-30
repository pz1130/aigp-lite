"use client";
import { CATALOG, type CatalogEntry } from "@/lib/runtime/catalog";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface Props {
  onPick: (slug: string) => void;
}

export function ProviderCatalogPicker({ onPick }: Props) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {CATALOG.map((e: CatalogEntry) => (
        <Button
          variant="secondary"
          className="flex flex-col items-start text-left h-auto py-3 px-3"
          onClick={() => onPick(e.slug)}
        >
          <span className="font-semibold">{t(e.displayNameKey)}</span>
          <span className="mt-1 text-xs text-tertiary">
            {t(e.descriptionKey)}
          </span>
        </Button>
      ))}
    </div>
  );
}
