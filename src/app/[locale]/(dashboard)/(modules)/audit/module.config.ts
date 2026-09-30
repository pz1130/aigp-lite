import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "audit",
  title: { en: "Audit Log", zh: "审计日志" },
  icon: MODULE_ICONS.audit,
  nav: { order: 90, group: "insight" },
  permissions: ["audit.read"],
});
