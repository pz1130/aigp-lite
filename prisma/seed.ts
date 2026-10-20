// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import { PrismaClient } from "@/lib/prisma";
import argon2 from "argon2";
import { FRAMEWORKS } from "./seeds/risk-controls";
import { seedFinosAigf } from "./seeds/finos-importer";
import { seedNistAiRmf } from "./seeds/nist-importer";
import { seedIso42001 } from "./seeds/iso42001-importer";
import { seedEuAiAct } from "./seeds/eu-ai-act-importer";

const prisma = new PrismaClient();

const ROLES = [
  "admin",
  "risk_officer",
  "ai_owner",
  "auditor",
  "viewer",
] as const;

async function seedDemoOrg(): Promise<{
  orgId: string;
  adminUserId: string;
  systemUserId: string;
}> {
  const existing = await prisma.organization.findFirst({
    where: { name: "Demo Org" },
  });
  const org =
    existing ??
    (await prisma.organization.create({
      data: { name: "Demo Org", plan: "free" },
    }));
  if (existing) console.log("Demo Org already exists; ensuring demo users.");
  const passwordHash = await argon2.hash("demo1234", { type: argon2.argon2id });

  // System user for auto-generated audit/risk records (§9 decision #2)
  const systemUser =
    (await prisma.user.findUnique({ where: { email: "system@aigp.local" } })) ??
    (await prisma.user.create({
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "system@aigp.local",
        name: "System",
        passwordHash: "", // no login
      },
    }));
  if (!existing) {
    console.log(`  + system → ${systemUser.email} (${systemUser.id})`);
  }

  let adminUserId = "";
  for (const role of ROLES) {
    const email = `${role}@demo.local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: role, passwordHash, locale: "zh" },
      create: { email, name: role, passwordHash, locale: "zh" },
    });
    await prisma.membership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
      update: { role },
      create: { orgId: org.id, userId: user.id, role },
    });
    if (role === "admin") adminUserId = user.id;
    if (!existing) console.log(`  + ${role} → ${email} / demo1234`);
  }
  if (!existing) console.log(`Seeded org ${org.id}`);
  return { orgId: org.id, adminUserId, systemUserId: systemUser.id };
}

async function seedRiskFrameworks() {
  for (const fw of FRAMEWORKS) {
    const exists = await prisma.riskFramework.findUnique({
      where: { code: fw.code },
    });
    if (exists) {
      console.log(`  · ${fw.code} already seeded; skipping`);
      continue;
    }
    const created = await prisma.riskFramework.create({
      data: { code: fw.code, name: fw.name, version: fw.version },
    });
    for (const c of fw.controls) {
      await prisma.riskControl.create({
        data: {
          frameworkId: created.id,
          code: c.code,
          title: c.title,
          description: c.description,
          severity: c.severity,
        },
      });
    }
    console.log(`  + ${fw.code}: ${fw.controls.length} controls`);
  }
}

async function seedDemoUsecase(orgId: string, ownerId: string) {
  const existing = await prisma.aiUsecase.findFirst({
    where: { orgId, name: "demo-production-usecase" },
  });
  if (existing) {
    console.log("  · demo-production-usecase already seeded; skipping");
    return;
  }
  await prisma.aiUsecase.create({
    data: {
      orgId,
      name: "demo-production-usecase",
      ownerId,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description:
        "Internal Q&A chatbot for HR policy queries. Stores user identifiers in conversation memory for personalisation across sessions.",
    },
  });
  console.log(
    "  + AiUsecase 'demo-production-usecase' (production / assistant / built)",
  );
}

async function main() {
  const { orgId, adminUserId, systemUserId } = await seedDemoOrg();
  await seedRiskFrameworks();
  await seedFinosAigf(systemUserId);
  await seedNistAiRmf();
  await seedIso42001();
  await seedEuAiAct();
  await seedDemoUsecase(orgId, adminUserId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
