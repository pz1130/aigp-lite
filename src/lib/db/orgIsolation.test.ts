import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg, ORG_SCOPED, ORG_NULLABLE_UNSCOPED } from "./orgIsolation";

/**
 * Parse the built Prisma schema and return every model that declares an
 * `orgId` field, split by whether that field is required or nullable.
 */
function modelsWithOrgId(): { required: string[]; nullable: string[] } {
  const schema = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8",
  );
  const required: string[] = [];
  const nullable: string[] = [];
  const modelRe = /model\s+(\w+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(schema))) {
    const name = m[1];
    // Find the matching closing brace for this model block.
    let depth = 1;
    let j = modelRe.lastIndex;
    while (j < schema.length && depth > 0) {
      if (schema[j] === "{") depth++;
      else if (schema[j] === "}") depth--;
      j++;
    }
    const body = schema.slice(modelRe.lastIndex, j - 1);
    const field = body.match(/^\s*orgId\s+(String\??)/m);
    if (field) (field[1].endsWith("?") ? nullable : required).push(name);
  }
  return { required, nullable };
}

describe("org-isolation coverage (schema ↔ ORG_SCOPED)", () => {
  it("every model with a required orgId is tenant-scoped", () => {
    const { required } = modelsWithOrgId();
    expect(required.length).toBeGreaterThan(0); // guard against a parse miss
    const missing = required.filter((name) => !ORG_SCOPED.has(name));
    expect(
      missing,
      `These models have a required orgId but are not in ORG_SCOPED, so ` +
        `withOrg() will NOT tenant-scope them: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("nullable-orgId models are explicitly accounted for, not silently scoped", () => {
    const { nullable } = modelsWithOrgId();
    for (const name of nullable) {
      // A nullable-orgId model must be a documented exception and must NOT be
      // in ORG_SCOPED (equality injection would hide its global null rows).
      expect(
        ORG_NULLABLE_UNSCOPED.has(name),
        `${name} has a nullable orgId but is not documented in ` +
          `ORG_NULLABLE_UNSCOPED`,
      ).toBe(true);
      expect(ORG_SCOPED.has(name)).toBe(false);
    }
  });

  it("ORG_SCOPED contains no stale entries absent from the schema", () => {
    const { required } = modelsWithOrgId();
    const known = new Set(required);
    const stale = [...ORG_SCOPED].filter((name) => !known.has(name));
    expect(
      stale,
      `ORG_SCOPED lists models with no required orgId in the schema: ` +
        `${stale.join(", ")}`,
    ).toEqual([]);
  });
});

let orgA: string;
let orgB: string;

beforeAll(async () => {
  // Global truncate runs in tests/unit-global-setup.ts; we only need to
  // wipe rows this file itself creates between re-runs in watch mode.
  await prisma.usecaseControlStatus.deleteMany();
  await prisma.usecaseRiskAssessment.deleteMany();
  await prisma.aiModelVersion.deleteMany();
  await prisma.aiUsecase.deleteMany();
  await prisma.governanceMaturityAssessment.deleteMany();
  await prisma.riskControl.deleteMany();
  await prisma.riskFramework.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.orgInvite.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.incidentTrendCluster.deleteMany();
  await prisma.incidentTrendReport.deleteMany();
  await prisma.usageInsightCluster.deleteMany();
  await prisma.usageInsightReport.deleteMany();
  // Trust Center rows reference User (createdBy/publishedBy/revokedBy).
  await prisma.trustAccessToken.deleteMany();
  await prisma.trustSnapshot.deleteMany();
  await prisma.trustProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  const a = await prisma.organization.create({ data: { name: "OrgA" } });
  const b = await prisma.organization.create({ data: { name: "OrgB" } });
  orgA = a.id;
  orgB = b.id;

  await prisma.auditLog.create({
    data: { orgId: orgA, action: "test", resourceType: "x", resourceId: "1" },
  });
  await prisma.auditLog.create({
    data: { orgId: orgB, action: "test", resourceType: "x", resourceId: "2" },
  });
});

describe("withOrg", () => {
  it("findMany on a scoped model returns only the org's rows", async () => {
    const scoped = withOrg(prisma, orgA);
    const rows = await scoped.auditLog.findMany();
    expect(rows.length).toBe(1);
    expect(rows[0].orgId).toBe(orgA);
  });

  it("create automatically attaches orgId", async () => {
    const scoped = withOrg(prisma, orgA);
    const row = await scoped.auditLog.create({
      data: {
        action: "auto",
        resourceType: "x",
        seqNum: 1,
      } as unknown as Parameters<typeof scoped.auditLog.create>[0]["data"],
    });
    expect(row.orgId).toBe(orgA);
  });

  it("create rejects mismatched orgId", async () => {
    const scoped = withOrg(prisma, orgA);
    await expect(
      scoped.auditLog.create({
        data: {
          orgId: orgB,
          action: "x",
          resourceType: "x",
        } as Parameters<typeof scoped.auditLog.create>[0]["data"],
      }),
    ).rejects.toThrow(/org.*mismatch/i);
  });
});
