import { MODULE_ICONS } from "@/components/ui/icons";
import { defineModule } from "@/lib/modules/types";

export default defineModule({
  slug: "mcp",
  title: { en: "MCP Servers", zh: "MCP 服务器" },
  icon: MODULE_ICONS.mcp,
  nav: { order: 86, group: "connect" },
  permissions: ["mcp.read", "mcp.write", "mcp.delete"],
});
