import { Badge } from "@/components/ui/badge";

const VARIANT_MAP: Record<string, "success" | "warn" | "danger" | "critical"> =
  {
    low: "success",
    medium: "warn",
    high: "danger",
    critical: "critical",
  };

export function McpRiskBadge({ tier }: { tier: string }) {
  return (
    <Badge variant={VARIANT_MAP[tier] ?? "neutral"} size="sm">
      {tier}
    </Badge>
  );
}
