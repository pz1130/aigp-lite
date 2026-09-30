"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandPalette,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command-palette";
import { MODULES } from "@/lib/modules/registry";
import { Search } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Icon } from "@/components/ui/icon";

export function CommandPaletteTrigger() {
  const _t = useTranslations("nav");
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-52 items-center gap-2 rounded-md border border-border-default/60 bg-surface/80 px-3 text-[12px] text-tertiary/70 hover:bg-surface hover:text-secondary transition-all"
      >
        <Search size={13} strokeWidth={1.5} className="shrink-0 opacity-60" />
        <span className="flex-1 text-left truncate">Search…</span>
        <kbd className="hidden sm:inline-flex h-4 items-center gap-0.5 rounded border border-border-default/60 bg-muted px-1 text-[10px] font-mono text-tertiary/60">
          ⌘K
        </kbd>
      </button>

      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        placeholder="Search pages, actions…"
      >
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => {
              router.push("/");
              setOpen(false);
            }}
            className="gap-2.5"
          >
            <span className="text-[13px] font-medium">Dashboard</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Modules">
          {MODULES.map((m) => (
            <CommandItem
              key={m.slug}
              onSelect={() => {
                router.push(`/${m.slug}`);
                setOpen(false);
              }}
              className="gap-2.5"
            >
              <Icon icon={m.icon} size={14} className="opacity-50 shrink-0" />
              <span className="text-[13px]">{m.title[locale]}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandPalette>
    </>
  );
}
