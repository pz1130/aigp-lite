import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "drift",
  title: { en: "Drift Monitoring", zh: "漂移监控" },
  icon: MODULE_ICONS.drift,
  nav: { order: 87, group: "govern" },
  permissions: ["drift.read", "drift.write", "drift.delete"],
});
