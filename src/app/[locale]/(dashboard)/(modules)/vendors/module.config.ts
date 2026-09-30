import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "vendors",
  title: { en: "Vendors", zh: "供应商" },
  icon: MODULE_ICONS.vendors,
  nav: { order: 45, group: "govern" },
  permissions: ["vendor.read", "vendor.write"],
});
