import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "members",
  title: { en: "Team Members", zh: "团队成员" },
  icon: MODULE_ICONS.members,
  nav: { order: 15, group: "govern" },
  permissions: ["org.read"],
});
