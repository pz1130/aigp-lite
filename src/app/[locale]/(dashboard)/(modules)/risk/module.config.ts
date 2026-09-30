import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "risk",
  title: { en: "Risk & Regulations", zh: "风险与合规" },
  icon: MODULE_ICONS.risk,
  nav: { order: 20, group: "govern" },
  permissions: ["risk.read", "risk.write"],
});
