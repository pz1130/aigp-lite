import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "providers",
  title: { en: "AI Provider", zh: "AI Provider" },
  icon: MODULE_ICONS.integrations,
  nav: { order: 85, group: "connect" },
  permissions: ["integrations.read", "integrations.write"],
});
