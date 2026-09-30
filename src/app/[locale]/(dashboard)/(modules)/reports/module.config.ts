import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "reports",
  title: { en: "Compliance Reports", zh: "合规报告" },
  icon: MODULE_ICONS.reports,
  nav: { order: 80, group: "operate" },
  permissions: ["reports.read", "reports.write", "reports.delete"],
});
