// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import { PrismaClient } from "@/lib/prisma";
import argon2 from "argon2";
import { FRAMEWORKS } from "./seeds/risk-controls";
import { seedFinosAigf } from "./seeds/finos-importer";
import { seedMitreAtlas } from "./seeds/atlas-importer";
import { seedAivtfCatalog } from "./seeds/aivtf-importer";
import { seedMfChecklistCatalog } from "./seeds/mf-checklist-importer";
import { seedNistAiRmf } from "./seeds/nist-importer";
import { seedIso42001 } from "./seeds/iso42001-importer";
import { seedEuAiAct } from "./seeds/eu-ai-act-importer";
import { seedMindForge } from "./seeds/mindforge-importer";
import { seedMindForgeCrosswalk } from "./seeds/mindforge-crosswalk-importer";
import { seedOwaspAsi } from "./seeds/owasp-asi-importer";
import { seedAsiRedteamChecklistCatalog } from "./seeds/asi-redteam-checklist-importer";
import { seedAgenticGovernanceCatalog } from "./seeds/agentic-governance-importer";
import { seedFrontierRiskTierCatalog } from "./seeds/frontier-risk-tier-importer";
import { seedAlignmentProbes } from "../src/lib/alignment-audit/seed";
import { encryptJson } from "@/lib/crypto/secrets";
import { computeTier } from "@/lib/materiality/rubric";
import { computeRating } from "@/lib/vendor/scoring";
import type { AnswerLite } from "@/lib/vendor/catalog";

const prisma = new PrismaClient();

// Demo org + demo1234 users are opt-out: on by default for local dev, CI and
// the dev compose stack; production sets AIGP_SEED_DEMO=0 so the migrate job
// only loads reference catalogs. NODE_ENV=production also disables it unless
// AIGP_SEED_DEMO is explicitly truthy.
function demoSeedEnabled(): boolean {
  const flag = process.env.AIGP_SEED_DEMO?.trim().toLowerCase();
  if (flag) return !["0", "false", "no", "off"].includes(flag);
  return process.env.NODE_ENV !== "production";
}

const ROLES = [
  "admin",
  "risk_officer",
  "ai_owner",
  "auditor",
  "viewer",
] as const;

async function seedSystemUser(): Promise<string> {
  // System user for auto-generated audit/risk records (§9 decision #2)
  const found = await prisma.user.findUnique({
    where: { email: "system@aigp.local" },
  });
  const created = !found;
  const systemUser =
    found ??
    (await prisma.user.create({
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "system@aigp.local",
        name: "System",
        passwordHash: "", // no login
      },
    }));
  if (created) {
    console.log(`  + system → ${systemUser.email} (${systemUser.id})`);
  }
  return systemUser.id;
}

async function seedDemoOrg(): Promise<{
  orgId: string;
  adminUserId: string;
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

  let adminUserId = "";
  for (const role of ROLES) {
    const email = `${role}@demo.local`;
    const user = await prisma.user.upsert({
      where: { email },
      // Never reset an existing user's password: re-running the seed (e.g. the
      // Docker migrate job on every deploy) must not restore demo1234.
      update: { name: role, locale: "zh" },
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
  return { orgId: org.id, adminUserId };
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

async function seedDemoProviderConnection(orgId: string, createdBy: string) {
  const existing = await prisma.providerConnection.findFirst({
    where: { orgId, name: "mock-local" },
  });
  if (existing) {
    const config = (existing.config as Record<string, unknown>) ?? {};
    if (config.defaultModel !== "gpt-4o-mini") {
      await prisma.providerConnection.update({
        where: { id: existing.id },
        data: { config: { ...config, defaultModel: "gpt-4o-mini" } },
      });
      console.log("  + mock-local defaultModel=gpt-4o-mini");
    }
    console.log("  · mock-local ProviderConnection already seeded; skipping");
    return;
  }
  await prisma.providerConnection.create({
    data: {
      orgId,
      name: "mock-local",
      providerType: "openai_compatible",
      baseUrl: "http://localhost:4010",
      credentialsEncrypted: new Uint8Array(
        encryptJson({ apiKey: "mock-api-key" }),
      ),
      config: { defaultModel: "gpt-4o-mini" },
      createdBy,
    },
  });
  console.log(
    "  + ProviderConnection 'mock-local' (openai_compatible, localhost:4010)",
  );
}

async function seedApiKey(orgId: string, createdBy: string) {
  const existing = await prisma.apiKey.findFirst({
    where: { label: "e2e-runtime-key" },
  });
  if (existing) {
    console.log("  · apiKey 'e2e-runtime-key' already seeded; skipping");
    return;
  }
  const crypto = await import("node:crypto");
  const keyBytes = crypto.randomBytes(32);
  const keyPrefix = "sk_test_e2e";
  const hash = crypto.createHash("sha256").update(keyBytes).digest("hex");
  await prisma.apiKey.create({
    data: {
      orgId,
      label: "e2e-runtime-key",
      prefix: keyPrefix,
      hash,
      scopes: ["runtime.invoke", "runtime.read"],
    },
  });
  console.log("  + ApiKey 'e2e-runtime-key' (runtime.invoke + runtime.read)");
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
        "Internal Q&A chatbot for HR policy queries. Stores user identifiers in conversation memory for personalisation across sessions. Used for E2E tests (FinOps hardCap, runtime invocations, risk copilot).",
    },
  });
  console.log(
    "  + AiUsecase 'demo-production-usecase' (production / assistant / built)",
  );
}

async function seedDemoIncident(orgId: string, openedById: string) {
  const existing = await prisma.incident.findFirst({
    where: { orgId, title: "Demo seeded incident" },
  });
  if (existing) {
    console.log("  · demo incident already seeded; skipping");
    return;
  }
  const usecase = await prisma.aiUsecase.findFirst({
    where: { orgId, name: "demo-production-usecase" },
  });
  await prisma.incident.create({
    data: {
      orgId,
      title: "Demo seeded incident",
      severity: "medium",
      status: "open",
      openedById,
      rootCause:
        "Seeded by prisma/seed.ts for E2E tests (m6 widget count, visual baseline detail page).",
      relatedUsecaseId: usecase?.id,
    },
  });
  console.log("  + Incident 'Demo seeded incident' (open / medium)");
}

async function seedDemoDataSource(orgId: string) {
  const existing = await prisma.dataSource.findFirst({
    where: { orgId, name: "Demo CRM Export" },
  });
  if (existing) {
    console.log("  · 'Demo CRM Export' data source already seeded; skipping");
    return existing.id;
  }
  const ds = await prisma.dataSource.create({
    data: {
      orgId,
      name: "Demo CRM Export",
      description:
        "Seeded historical customer records used for the demo training pipeline.",
      sensitivity: "confidential",
      origin: "first_party",
    },
  });
  console.log("  + DataSource 'Demo CRM Export' (confidential / first_party)");
  return ds.id;
}

async function seedDemoGovernance(
  orgId: string,
  actorId: string,
  usecaseId: string,
) {
  // --- Materiality (proportionality tiering) ---------------------------------
  const matInputs = {
    affectedParties: 2,
    decisionConsequence: 2,
    financialSafety: 1,
    dataSensitivity: 2,
  };
  const { tier } = computeTier(matInputs, "assistant");
  await prisma.usecaseMateriality.upsert({
    where: { usecaseId },
    create: {
      orgId,
      usecaseId,
      ...matInputs,
      computedTier: tier,
      assessedById: actorId,
    },
    update: {},
  });
  console.log(`  + UsecaseMateriality (demo usecase, tier=${tier})`);

  // --- Fairness assessment ---------------------------------------------------
  const existingFairness = await prisma.usecaseFairnessAssessment.findFirst({
    where: { orgId, usecaseId },
  });
  if (existingFairness) {
    console.log("  · demo fairness assessment already seeded; skipping");
  } else {
    await prisma.usecaseFairnessAssessment.create({
      data: {
        orgId,
        usecaseId,
        status: "completed",
        proxyReview: "yes",
        feedbackLoop: "yes",
        completedById: actorId,
        completedAt: new Date(),
        notes:
          "Seeded fairness record: selection-rate parity reviewed across gender subgroups.",
        attributes: {
          create: [
            {
              name: "gender",
              metric: "selection_rate",
              subgroups: {
                create: [
                  { label: "female", value: 0.55 },
                  { label: "male", value: 0.62 },
                ],
              },
            },
          ],
        },
      },
    });
    console.log("  + UsecaseFairnessAssessment (demo usecase, completed)");
  }

  // --- Vendor due-diligence register -----------------------------------------
  // Mostly-good model provider with a few standard gaps -> "medium" rating.
  const answers: AnswerLite[] = [
    { itemCode: "DP-1", status: "yes" },
    { itemCode: "DP-2", status: "partial" },
    { itemCode: "DP-3", status: "yes" },
    { itemCode: "DP-4", status: "no" },
    { itemCode: "SEC-1", status: "yes" },
    { itemCode: "SEC-2", status: "yes" },
    { itemCode: "SEC-3", status: "yes" },
    { itemCode: "LEG-1", status: "yes" },
    { itemCode: "LEG-2", status: "partial" },
    { itemCode: "LEG-3", status: "yes" },
    { itemCode: "MOD-1", status: "yes" },
    { itemCode: "MOD-2", status: "partial" },
    { itemCode: "MOD-3", status: "no" },
    { itemCode: "OPS-1", status: "partial" },
    { itemCode: "OPS-2", status: "yes" },
    { itemCode: "OPS-3", status: "no" },
  ];
  const rating = computeRating("model_provider", answers);
  const renewal = new Date();
  renewal.setMonth(renewal.getMonth() + 9);
  const vendor = await prisma.vendor.upsert({
    where: { orgId_name: { orgId, name: "Demo Model Provider" } },
    create: {
      orgId,
      name: "Demo Model Provider",
      vendorType: "model_provider",
      description:
        "Seeded foundation-model provider used by the demo HR chatbot use case.",
      dataResidency: "EU (Frankfurt)",
      contractRenewalDate: renewal,
      modelChangeNotice: true,
      computedRating: rating,
      assessedById: actorId,
      assessedAt: new Date(),
    },
    update: {},
  });
  await prisma.$transaction(
    answers.map((a) =>
      prisma.vendorDueDiligenceAnswer.upsert({
        where: {
          vendorId_itemCode: { vendorId: vendor.id, itemCode: a.itemCode },
        },
        update: { status: a.status },
        create: { vendorId: vendor.id, itemCode: a.itemCode, status: a.status },
      }),
    ),
  );
  await prisma.vendorUsecaseLink.upsert({
    where: { vendorId_usecaseId: { vendorId: vendor.id, usecaseId } },
    create: { orgId, vendorId: vendor.id, usecaseId },
    update: {},
  });
  console.log(
    `  + Vendor 'Demo Model Provider' (rating=${rating}, linked to demo usecase)`,
  );
}

async function main() {
  const systemUserId = await seedSystemUser();
  await seedRiskFrameworks();
  await seedFinosAigf(systemUserId);
  await seedMitreAtlas();
  await seedAivtfCatalog();
  await seedMfChecklistCatalog();
  await seedNistAiRmf();
  await seedIso42001();
  await seedEuAiAct();
  await seedMindForge();
  await seedMindForgeCrosswalk();
  await seedOwaspAsi();
  await seedAsiRedteamChecklistCatalog();
  await seedAgenticGovernanceCatalog();
  await seedFrontierRiskTierCatalog();
  await seedAlignmentProbes(prisma);

  if (!demoSeedEnabled()) {
    console.log("AIGP_SEED_DEMO disabled; skipping demo org and demo users.");
    return;
  }
  const { orgId, adminUserId } = await seedDemoOrg();
  await seedDemoProviderConnection(orgId, adminUserId);
  await seedApiKey(orgId, adminUserId);
  await seedDemoUsecase(orgId, adminUserId);
  await seedDemoIncident(orgId, adminUserId);
  const demoDsId = await seedDemoDataSource(orgId);
  const demoUc = await prisma.aiUsecase.findFirst({
    where: { orgId, name: "demo-production-usecase" },
  });
  if (demoUc && demoDsId) {
    await prisma.usecaseDataLink.upsert({
      where: {
        usecaseId_dataSourceId_direction: {
          usecaseId: demoUc.id,
          dataSourceId: demoDsId,
          direction: "training",
        },
      },
      create: {
        usecaseId: demoUc.id,
        dataSourceId: demoDsId,
        direction: "training",
        purpose: "Demo training data",
      },
      update: {},
    });
    console.log(
      "  + UsecaseDataLink (Demo CRM Export → demo-production-usecase, training)",
    );
  }
  if (demoUc) {
    await seedDemoGovernance(orgId, adminUserId, demoUc.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
