import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "mindforge-checklist",
  title: { en: "MindForge Checklist", zh: "MindForge 清单" },
  icon: MODULE_ICONS["mindforge-checklist"],
  nav: { order: 89, group: "govern" },
  permissions: [
    "mindforge-checklist.read",
    "mindforge-checklist.write",
    "mindforge-checklist.approve",
  ],
});
