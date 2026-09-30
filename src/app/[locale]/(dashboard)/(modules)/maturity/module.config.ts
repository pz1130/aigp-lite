import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";
export default defineModule({
  slug: "maturity",
  title: { en: "Governance Maturity", zh: "治理成熟度" },
  icon: MODULE_ICONS.maturity,
  nav: { order: 40, group: "govern" },
  permissions: ["maturity.read", "maturity.write"],
});
