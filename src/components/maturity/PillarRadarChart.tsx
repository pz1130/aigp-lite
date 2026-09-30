"use client";
import {
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { useTranslations } from "next-intl";
import { PILLARS } from "@/lib/maturity/pillars";
import { Card, CardBody } from "@/components/ui/card";

export function PillarRadarChart({
  scores,
}: {
  scores: Record<string, { scoreInt: number; maxScore: number } | null>;
}) {
  const t = useTranslations("maturity.pillars");
  const data = PILLARS.map((p) => ({
    pillar: t(p),
    pct: scores[p]
      ? Math.round((scores[p]!.scoreInt / scores[p]!.maxScore) * 100)
      : 0,
  }));
  return (
    <Card>
      <CardBody>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="pillar" />
            <PolarRadiusAxis angle={30} domain={[0, 100]} />
            <Radar
              name="Maturity %"
              dataKey="pct"
              fill="#3b82f6"
              fillOpacity={0.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  );
}
