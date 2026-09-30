import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const VARIANT: Record<string, "danger" | "warn" | "info" | "neutral"> = {
  restricted: "danger",
  confidential: "warn",
  internal: "info",
  public: "neutral",
};

export function SensitivityBadge({
  value,
  size = "sm",
}: {
  value: string;
  size?: "sm" | "md";
}) {
  const t = useTranslations("dataLineage");
  return (
    <Badge variant={VARIANT[value] ?? "neutral"} size={size}>
      {t(`sensitivityLevels.${value}`)}
    </Badge>
  );
}
