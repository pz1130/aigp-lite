import { MODULE_ICONS } from "@/components/ui/icons";
import type { ModuleConfig } from "@/lib/modules/types";

export const POLICY_MODULE: ModuleConfig = {
  slug: "policy",
  title: { en: "Policies", zh: "策略与运行时" },
  icon: MODULE_ICONS.policy,
  nav: { order: 30, group: "govern" },
  permissions: ["policy.read", "policy.write", "policy.delete"],
};
