import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "workflow",
  title: { en: "Workflow", zh: "审批流程" },
  icon: MODULE_ICONS.workflow,
  nav: { order: 50, group: "operate" },
  permissions: ["workflow.read", "workflow.write", "workflow.delete"],
});
