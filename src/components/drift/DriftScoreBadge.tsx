import { Badge } from "@/components/ui/badge";

export function DriftScoreBadge({
  score,
  threshold,
}: {
  score: number;
  threshold?: number;
}) {
  const t = threshold ?? 7;
  const variant = score >= t ? "success" : score >= t - 2 ? "warn" : "danger";
  return (
    <Badge variant={variant} size="sm">
      {score.toFixed(1)}
    </Badge>
  );
}
