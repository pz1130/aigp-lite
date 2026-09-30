import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "aivtf",
  title: { en: "AIVTF Checklist", zh: "AIVTF 清单" },
  icon: MODULE_ICONS.aivtf,
  nav: { order: 88, group: "govern" },
  permissions: ["aivtf.read", "aivtf.write", "aivtf.approve"],
});
