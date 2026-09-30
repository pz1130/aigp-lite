import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "redteam",
  title: { en: "AI Trust", zh: "AI 信任" },
  icon: MODULE_ICONS.redteam,
  nav: { order: 20, group: "govern" },
  permissions: ["redteam.read", "redteam.write", "redteam.delete"],
});
