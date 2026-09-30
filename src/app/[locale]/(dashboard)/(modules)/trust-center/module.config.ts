import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "trust-center",
  title: { en: "Trust Center", zh: "信任中心" },
  icon: MODULE_ICONS["trust-center"],
  nav: { order: 87, group: "connect" },
  permissions: [
    "trust-center.read",
    "trust-center.write",
    "trust-center.approve",
    "trust-center.delete",
  ],
});
