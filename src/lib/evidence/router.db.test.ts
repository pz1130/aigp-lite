// @vitest-environment node
// Prisma Bytes + undici File are both happier outside jsdom.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", () => ({
  store: vi.fn(async (orgId: string, file: File) => ({
    path: `evidence/${orgId}/${file.name}`,
    sha256: "0".repeat(64),
    bytes: file.size,
  })),
}));

import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import { store } from "@/lib/storage";
import type { TRPCContext } from "@/lib/trpc/server";
import type { Role } from "@/lib/rbac/roles";

const TAG = "EVIDENCE-RT";

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
    data: { email: `ev-${tag}-${Date.now()}@t.local`, name: tag },
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      ownerId: user.id,
      name: `${tag} system`,
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

const pdf = (name: string) =>
  new File(["%PDF-1.4 test"], name, { type: "application/pdf" });

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await seedTenant("a");
  b = await seedTenant("b");
});

afterAll(async () => {
  await prisma.evidence.deleteMany({
    where: { org: { name: { startsWith: TAG } } },
  });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("evidence router", () => {
  it("uploads, stores under the caller's org, and audits", async () => {
    const rec = await a.caller.evidence.upload({
      file: pdf("dpia.pdf"),
      usecaseId: a.usecaseId,
      notes: "signed",
    });
    expect(store).toHaveBeenCalledWith(a.orgId, expect.any(File));
    expect(rec).toMatchObject({
      orgId: a.orgId,
      usecaseId: a.usecaseId,
      filename: "dpia.pdf",
      mimeType: "application/pdf",
      uploadedById: a.userId,
      notes: "signed",
    });
    const audit = await prisma.auditLog.findFirst({
      where: { orgId: a.orgId, action: "evidence.upload", resourceId: rec.id },
    });
    expect(audit).not.toBeNull();
    expect(await a.caller.evidence.byId({ id: rec.id })).toMatchObject({
      id: rec.id,
    });
  });

  it("lists with usecase filter and cursor pagination", async () => {
    const other = await prisma.aiUsecase.create({
      data: {
        orgId: a.orgId,
        ownerId: a.userId,
        name: "other",
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    for (const n of ["1", "2", "3"]) {
      await a.caller.evidence.upload({
        file: pdf(`page-${n}.pdf`),
        usecaseId: other.id,
      });
    }
    const filtered = await a.caller.evidence.list({ usecaseId: other.id });
    expect(filtered).toHaveLength(3);

    // The router returns limit + 1 rows so the client can tell there's more.
    const first = await a.caller.evidence.list({
      usecaseId: other.id,
      limit: 1,
    });
    expect(first).toHaveLength(2);
    const next = await a.caller.evidence.list({
      usecaseId: other.id,
      limit: 1,
      cursor: first[0].id,
    });
    expect(next[0].id).toBe(first[1].id);
  });

  it("refuses uploads from a role without evidence.write", async () => {
    const viewer = appRouter.createCaller(ctx(a.orgId, a.userId, "viewer"));
    await expect(
      viewer.evidence.upload({ file: pdf("x.pdf") }),
    ).rejects.toThrow(/lacks|FORBIDDEN/);
  });
});

describe("evidence tenant isolation", () => {
  it("cannot attach evidence to another org's usecase", async () => {
    vi.mocked(store).mockClear();
    await expect(
      a.caller.evidence.upload({ file: pdf("x.pdf"), usecaseId: b.usecaseId }),
    ).rejects.toThrow("NOT_FOUND");
    // Rejected before anything is written to storage.
    expect(store).not.toHaveBeenCalled();
  });

  it("cannot read or list another org's evidence", async () => {
    const theirs = await b.caller.evidence.upload({
      file: pdf("theirs.pdf"),
      usecaseId: b.usecaseId,
    });
    await expect(a.caller.evidence.byId({ id: theirs.id })).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(await a.caller.evidence.list({ usecaseId: b.usecaseId })).toEqual(
      [],
    );
    const all = await a.caller.evidence.list();
    expect(all.map((e) => e.id)).not.toContain(theirs.id);
  });
});
