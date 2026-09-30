import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "incidents",
  title: { en: "Incidents", zh: "安全事件" },
  icon: MODULE_ICONS.incidents,
  nav: { order: 70, group: "operate" },
  permissions: ["incident.read", "incident.write", "incident.delete"],
});
