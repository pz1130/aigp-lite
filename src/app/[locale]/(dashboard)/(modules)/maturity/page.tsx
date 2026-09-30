import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PillarRadarChart } from "@/components/maturity/PillarRadarChart";
import { GovernanceScoreCard } from "@/components/maturity/GovernanceScoreCard";
import { PageHeader } from "@/components/page/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { PILLARS } from "@/lib/maturity/pillars";

export default async function MaturityPage() {
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("maturity");

  const [scores, _latestByPillar] = await Promise.all([
    Promise.all(
      PILLARS.map(async (p) => {
        const r = await db.governanceMaturityAssessment.findFirst({
          where: { pillar: p },
          orderBy: { ts: "desc" },
        });
        return r ? { scoreInt: r.scoreInt, maxScore: r.maxScore } : null;
      }),
    ),
    Promise.all(
      PILLARS.map(async (p) => {
        const r = await db.governanceMaturityAssessment.findFirst({
          where: { pillar: p },
          orderBy: { ts: "desc" },
        });
        return r
          ? { scoreInt: r.scoreInt, maxScore: r.maxScore, ts: r.ts }
          : null;
      }),
    ),
  ]);

  const scoresMap: Record<
    string,
    { scoreInt: number; maxScore: number } | null
  > = {};
  PILLARS.forEach((p, i) => {
    scoresMap[p] = scores[i];
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
        action={
          <Link href="/maturity/new">
            <Button size="sm">{t("takeAssessment")}</Button>
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <GovernanceScoreCard />
        <Card>
          <CardBody>
            <PillarRadarChart scores={scoresMap} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
