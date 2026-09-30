import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "usage-insights",
  title: { en: "Usage Insights", zh: "使用洞察" },
  icon: MODULE_ICONS["usage-insights"],
  nav: { order: 95, group: "govern" },
  permissions: ["usage-insights.read", "usage-insights.write"],
});
