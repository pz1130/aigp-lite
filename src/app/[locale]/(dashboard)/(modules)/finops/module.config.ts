import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "finops",
  title: { en: "Finops", zh: "成本管理" },
  icon: MODULE_ICONS.finops,
  nav: { order: 90, group: "insight" },
  permissions: ["finops.read", "finops.write"],
});
