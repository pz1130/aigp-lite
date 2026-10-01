import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import type { Role } from "@/lib/rbac/roles";

const TAG = "LINEAGE-CRUD";

type Tenant = {
  orgId: string;
  userId: string;
  usecaseId: string;
  caller: ReturnType<typeof appRouter.createCaller>;
};

function ctx(orgId: string, userId: string, role: Role): TRPCContext {
  return { session: { userId, orgId, role, email: `${userId}@x` } };
}

async function seedTenant(tag: string): Promise<Tenant> {
  const org = await prisma.organization.create({
    data: { name: `${TAG}-${tag}-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: { email: `lc-${tag}-${Date.now()}@t.local`, name: tag },
  });
  await prisma.membership.create({
    data: { orgId: org.id, userId: user.id, role: "admin" },
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      ownerId: user.id,
      name: `${tag} assistant`,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  return {
    orgId: org.id,
    userId: user.id,
    usecaseId: uc.id,
    caller: appRouter.createCaller(ctx(org.id, user.id, "admin")),
  };
}

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await seedTenant("a");
  b = await seedTenant("b");
});

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("dataLineage CRUD", () => {
  it("creates, reads, updates and deletes a data source", async () => {
    const ds = await a.caller.dataLineage.create({ name: "Warehouse" });
    expect(ds).toMatchObject({
      orgId: a.orgId,
      sensitivity: "internal",
      origin: "first_party",
    });

    const updated = await a.caller.dataLineage.update({
      id: ds.id,
      sensitivity: "restricted",
    });
    expect(updated.sensitivity).toBe("restricted");

    const fetched = await a.caller.dataLineage.byId({ id: ds.id });
    expect(fetched).toMatchObject({ name: "Warehouse", links: [] });

    await a.caller.dataLineage.delete({ id: ds.id });
    await expect(a.caller.dataLineage.byId({ id: ds.id })).rejects.toThrow(
      "NOT_FOUND",
    );

    const audit = await prisma.auditLog.findMany({
      where: { orgId: a.orgId, resourceId: ds.id },
      select: { action: true },
    });
    expect(audit.map((r) => r.action).sort()).toEqual([
      "data_source.create",
      "data_source.delete",
      "data_source.update",
    ]);
  });

  it("links, re-links (upsert) and unlinks a usecase", async () => {
    const ds = await a.caller.dataLineage.create({ name: "Tickets" });
    const input = { usecaseId: a.usecaseId, dataSourceId: ds.id };

    await a.caller.dataLineage.linkUsecase({ ...input, purpose: "v1" });
    await a.caller.dataLineage.linkUsecase({ ...input, purpose: "v2" });
    const links = await a.caller.dataLineage.byUsecase({
      usecaseId: a.usecaseId,
    });
    expect(links).toEqual([
      expect.objectContaining({
        dataSourceId: ds.id,
        direction: "training",
        purpose: "v2",
        dataSource: expect.objectContaining({ name: "Tickets" }),
      }),
    ]);

    await a.caller.dataLineage.unlinkUsecase({
      ...input,
      direction: "training",
    });
    expect(
      await a.caller.dataLineage.byUsecase({ usecaseId: a.usecaseId }),
    ).toEqual([]);
  });

  it("refuses writes from a role without data_lineage.write", async () => {
    const viewer = appRouter.createCaller(ctx(a.orgId, a.userId, "viewer"));
    await expect(viewer.dataLineage.create({ name: "Nope" })).rejects.toThrow(
      /lacks|FORBIDDEN/,
    );
  });
});

describe("dataLineage tenant isolation", () => {
  it("cannot link another org's usecase or data source", async () => {
    const ownDs = await a.caller.dataLineage.create({ name: "Own" });
    const foreignDs = await b.caller.dataLineage.create({ name: "Foreign" });

    await expect(
      a.caller.dataLineage.linkUsecase({
        usecaseId: b.usecaseId,
        dataSourceId: ownDs.id,
      }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      a.caller.dataLineage.linkUsecase({
        usecaseId: a.usecaseId,
        dataSourceId: foreignDs.id,
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(
      await prisma.usecaseDataLink.count({
        where: {
          OR: [{ usecaseId: b.usecaseId }, { dataSourceId: foreignDs.id }],
        },
      }),
    ).toBe(0);
  });

  it("cannot read or delete another org's links", async () => {
    const foreignDs = await b.caller.dataLineage.create({ name: "B CRM" });
    const key = { usecaseId: b.usecaseId, dataSourceId: foreignDs.id };
    await b.caller.dataLineage.linkUsecase(key);

    await expect(
      a.caller.dataLineage.byUsecase({ usecaseId: b.usecaseId }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      a.caller.dataLineage.unlinkUsecase({ ...key, direction: "training" }),
    ).rejects.toThrow("NOT_FOUND");
    expect(
      await b.caller.dataLineage.byUsecase({ usecaseId: b.usecaseId }),
    ).toHaveLength(1);
  });

  it("cannot update, delete or fetch another org's data source", async () => {
    const foreignDs = await b.caller.dataLineage.create({ name: "B only" });
    await expect(
      a.caller.dataLineage.byId({ id: foreignDs.id }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      a.caller.dataLineage.update({ id: foreignDs.id, name: "pwned" }),
    ).rejects.toThrow();
    await expect(
      a.caller.dataLineage.delete({ id: foreignDs.id }),
    ).rejects.toThrow();
    const still = await prisma.dataSource.findUnique({
      where: { id: foreignDs.id },
    });
    expect(still?.name).toBe("B only");
    const listed = await a.caller.dataLineage.list();
    expect(listed.map((d) => d.id)).not.toContain(foreignDs.id);
  });

  it("hides a pre-existing cross-org link from list and byId", async () => {
    // A link that the old, unchecked linkUsecase could have written.
    const ownDs = await a.caller.dataLineage.create({ name: "Leaky" });
    await prisma.usecaseDataLink.create({
      data: { usecaseId: b.usecaseId, dataSourceId: ownDs.id },
    });
    const byId = await a.caller.dataLineage.byId({ id: ownDs.id });
    expect(byId.links).toEqual([]);
    const listed = await a.caller.dataLineage.list();
    expect(listed.find((d) => d.id === ownDs.id)?.links).toEqual([]);
  });
});
