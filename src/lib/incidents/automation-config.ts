import { prisma } from "@/lib/db";
import type { OrgIncidentAutomationConfig } from "@/lib/prisma";

export async function getOrgAutomationConfig(
  orgId: string,
): Promise<OrgIncidentAutomationConfig> {
  return prisma.orgIncidentAutomationConfig.upsert({
    where: { orgId },
    create: { orgId },
    update: {},
  });
}
