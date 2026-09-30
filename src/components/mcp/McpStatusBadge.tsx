import { Badge } from "@/components/ui/badge";

const VARIANT_MAP: Record<string, "success" | "neutral" | "danger"> = {
  active: "success",
  inactive: "neutral",
  archived: "danger",
};

export function McpStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={VARIANT_MAP[status] ?? "neutral"} size="sm">
      {status}
    </Badge>
  );
}
