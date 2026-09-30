import type { Permission } from "@/lib/rbac/roles";

import type { LucideIcon } from "lucide-react";

export type LocalizedString = { en: string; zh: string };

export interface ModuleConfig {
  slug: string;
  title: LocalizedString;
  icon: LucideIcon;
  nav: { order: number; group: "govern" | "operate" | "connect" | "insight" };
  permissions: Permission[];
  events?: { subscribes?: string[]; publishes?: string[] };
}

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

export function defineModule(cfg: ModuleConfig): Readonly<ModuleConfig> {
  if (!SLUG_RE.test(cfg.slug)) {
    throw new Error(
      `invalid module slug "${cfg.slug}" (must match ${SLUG_RE})`,
    );
  }
  return Object.freeze({ ...cfg, permissions: [...cfg.permissions] });
}
