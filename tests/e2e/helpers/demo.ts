// Prisma 7 no longer auto-loads .env; needed when Playwright workers import prisma.
import "dotenv/config";
import { prisma } from "@/lib/db";

/** Resolve the seeded demo admin + org (same pattern as m12-redteam). */
export async function demoOrgAndAdmin() {
  const admin = await prisma.user.findFirst({
    where: { email: "admin@demo.local" },
  });
  if (!admin)
    throw new Error(
      "[e2e] expected admin@demo.local to be seeded — run `npm run prisma:seed`",
    );
  const membership = await prisma.membership.findFirst({
    where: { userId: admin.id },
  });
  if (!membership)
    throw new Error("[e2e] expected admin membership to be seeded");
  return { admin, orgId: membership.orgId };
}

/** First AiUsecase in the demo org (seeded by prisma:seed). */
export async function demoUsecase(orgId: string) {
  const usecase = await prisma.aiUsecase.findFirst({ where: { orgId } });
  if (!usecase)
    throw new Error(
      "[e2e] expected an AiUsecase in the demo org — run `npm run prisma:seed`",
    );
  return usecase;
}
