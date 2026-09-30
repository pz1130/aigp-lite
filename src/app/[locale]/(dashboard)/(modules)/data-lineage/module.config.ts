import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "data-lineage",
  title: { en: "Data Lineage", zh: "数据血缘" },
  icon: MODULE_ICONS["data-lineage"],
  nav: { order: 95, group: "operate" },
  permissions: [],
});
