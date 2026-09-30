"use client";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export function FriaStatusBadge({
  status,
}: {
  status: "draft" | "submitted" | "approved" | "archived";
}) {
  const t = useTranslations("fria.status");
  const variant =
    status === "draft"
      ? "neutral"
      : status === "submitted"
        ? "warn"
        : status === "approved"
          ? "success"
          : "neutral";
  return (
    <Badge variant={variant} size="sm">
      {t(status)}
    </Badge>
  );
}
