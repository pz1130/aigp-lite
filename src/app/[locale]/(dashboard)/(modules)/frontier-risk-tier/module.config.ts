import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "frontier-risk-tier",
  title: { en: "Frontier Risk Tier", zh: "前沿风险分级" },
  icon: MODULE_ICONS["frontier-risk-tier"],
  nav: { order: 91, group: "govern" },
  permissions: [
    "frontier-risk-tier.read",
    "frontier-risk-tier.write",
    "frontier-risk-tier.approve",
  ],
});
