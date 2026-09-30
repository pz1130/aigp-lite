import { Badge } from "@/components/ui/badge";
import { getTranslations } from "next-intl/server";

export async function McpDriftBadge({ driftStatus }: { driftStatus: string }) {
  if (driftStatus !== "pending_review") return null;
  const t = await getTranslations("mcp");
  return (
    <Badge variant="danger" size="sm">
      {t("drift.badge")}
    </Badge>
  );
}
