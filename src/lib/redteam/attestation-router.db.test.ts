// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { createRedteamAttestation } from "@/lib/redteam/attestation";
import { appRouter } from "@/lib/trpc/router";
import type { Role } from "@/lib/rbac/roles";

const TAG = "RTA-ROUTER";

function pdf() {
  return {
    buffer: Buffer.from("%PDF-1.4\nx\n"),
    filename: "r.pdf",
    mimeType: "application/pdf",
  };
}

async function seed(name: string) {
  const org = await prisma.organization.create({
    data: { name: `${TAG}-${name}-${Date.now()}-${Math.random()}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `rtr-${Date.now()}-${Math.random()}@t.local`,
      name: "RTR",
      passwordHash: "x",
    },
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      name: `${TAG}-uc`,
      ownerId: user.id,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  return { org, user, uc };
}

function caller(orgId: string, userId: string, role: Role) {
  return appRouter.createCaller({
    session: { orgId, userId, role, email: `${userId}@test.local` },
    ip: undefined,
  });
}

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("redteamAttestation router", () => {
  it("lists a usecase's attestations newest-first, org-scoped", async () => {
    const { org, user, uc } = await seed("list");
    await createRedteamAttestation({
      db: withOrg(prisma, org.id),
      orgId: org.id,
      userId: user.id,
      file: pdf(),
      fields: {
        usecaseId: uc.id,
        attesterName: "Older",
        scope: "s",
        attestedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    await createRedteamAttestation({
      db: withOrg(prisma, org.id),
      orgId: org.id,
      userId: user.id,
      file: pdf(),
      fields: {
        usecaseId: uc.id,
        attesterName: "Newer",
        scope: "s",
        attestedAt: "2026-06-01T00:00:00.000Z",
      },
    });
    const rows = await caller(org.id, user.id, "admin").redteamAttestation.list(
      { usecaseId: uc.id },
    );
    expect(rows.map((r) => r.attesterName)).toEqual(["Newer", "Older"]);
  });

  it("delete removes the row", async () => {
    const { org, user, uc } = await seed("del");
    const { id } = await createRedteamAttestation({
      db: withOrg(prisma, org.id),
      orgId: org.id,
      userId: user.id,
      file: pdf(),
      fields: {
        usecaseId: uc.id,
        attesterName: "X",
        scope: "s",
        attestedAt: "2026-06-01T00:00:00.000Z",
      },
    });
    await caller(org.id, user.id, "admin").redteamAttestation.delete({ id });
    expect(
      await prisma.redteamAttestation.findUnique({ where: { id } }),
    ).toBeNull();
  });

  it("org B cannot delete org A's attestation", async () => {
    const a = await seed("iso-a");
    const b = await seed("iso-b");
    const { id } = await createRedteamAttestation({
      db: withOrg(prisma, a.org.id),
      orgId: a.org.id,
      userId: a.user.id,
      file: pdf(),
      fields: {
        usecaseId: a.uc.id,
        attesterName: "A",
        scope: "s",
        attestedAt: "2026-06-01T00:00:00.000Z",
      },
    });
    await expect(
      caller(b.org.id, b.user.id, "admin").redteamAttestation.delete({ id }),
    ).rejects.toThrow();
    expect(
      await prisma.redteamAttestation.findUnique({ where: { id } }),
    ).not.toBeNull();
  });
});
