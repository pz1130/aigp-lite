import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "incident-trends",
  title: { en: "Incident Trends", zh: "事件趋势" },
  icon: MODULE_ICONS["incident-trends"],
  nav: { order: 94, group: "govern" },
  permissions: ["incident-trends.read", "incident-trends.write"],
});
