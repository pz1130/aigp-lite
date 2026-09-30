"use client";
import { Card, CardBody } from "@/components/ui/card";
import { MaturityRadarWidget } from "@/components/widgets/MaturityRadarWidget";
import { useTranslations } from "next-intl";

export function MaturityRadarCard() {
  const _t = useTranslations("dashboard");
  return (
    <Card className="h-full">
      <CardBody className="p-4">
        <MaturityRadarWidget />
      </CardBody>
    </Card>
  );
}
