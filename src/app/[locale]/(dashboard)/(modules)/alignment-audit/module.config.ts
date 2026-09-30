import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "alignment-audit",
  title: { en: "Alignment Audit", zh: "对齐审计" },
  icon: MODULE_ICONS["alignment-audit"],
  nav: { order: 96, group: "govern" },
  permissions: [
    "alignment-audit.read",
    "alignment-audit.write",
    "alignment-audit.delete",
  ],
});
