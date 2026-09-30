import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "agentic-governance",
  title: { en: "Agentic Governance", zh: "智能体治理" },
  icon: MODULE_ICONS["agentic-governance"],
  nav: { order: 93, group: "govern" },
  permissions: [
    "agentic-governance.read",
    "agentic-governance.write",
    "agentic-governance.approve",
  ],
});
