import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "external-reports",
  title: { en: "External Reports", zh: "外部报告" },
  icon: MODULE_ICONS["external-reports"],
  nav: { order: 95, group: "govern" },
  permissions: [
    "external-reports.read",
    "external-reports.write",
    "external-reports.delete",
  ],
});
