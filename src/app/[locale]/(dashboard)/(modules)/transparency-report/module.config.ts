import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "transparency-report",
  title: { en: "Transparency Report", zh: "透明度报告" },
  icon: MODULE_ICONS["transparency-report"],
  nav: { order: 92, group: "govern" },
  permissions: [
    "transparency-report.read",
    "transparency-report.write",
    "transparency-report.approve",
  ],
});
