import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "asi-redteam-checklist",
  title: { en: "ASI Red-Team Checklist", zh: "ASI 红队清单" },
  icon: MODULE_ICONS["asi-redteam-checklist"],
  nav: { order: 90, group: "govern" },
  permissions: [
    "asi-redteam-checklist.read",
    "asi-redteam-checklist.write",
    "asi-redteam-checklist.approve",
  ],
});
