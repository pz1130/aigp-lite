import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "inventory",
  title: { en: "AI Inventory", zh: "AI 资产登记" },
  icon: MODULE_ICONS.inventory,
  nav: { order: 10, group: "govern" },
  permissions: ["inventory.read", "inventory.write", "inventory.delete"],
});
