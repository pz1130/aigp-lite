import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "integrations",
  title: { en: "Integrations", zh: "集成管理" },
  icon: MODULE_ICONS.integrations,
  nav: { order: 80, group: "connect" },
  permissions: ["integrations.write"],
});
