import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "evidence",
  title: { en: "Evidence", zh: "证据管理" },
  icon: MODULE_ICONS.evidence,
  nav: { order: 60, group: "operate" },
  permissions: ["evidence.read", "evidence.write"],
});
