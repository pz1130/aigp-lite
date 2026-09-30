import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createFria,
  updateDraftSections,
  submitFria,
  withdrawFria,
  approveFria,
  supersedeFria,
  archiveFria,
  listFriasForUsecase,
  FriaStateError,
} from "./service";

let orgId: string;
let usecaseId: string;
let creatorId: string;
let approverId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `FRIA ${Date.now()}` },
  });
  orgId = org.id;
  const c = await prisma.user.create({
    data: {
      email: `fc-${Date.now()}@x.test`,
      name: "Creator",
      passwordHash: "x",
    },
  });
  creatorId = c.id;
  const a = await prisma.user.create({
    data: {
      email: `fa-${Date.now()}@x.test`,
      name: "Approver",
      passwordHash: "x",
    },
  });
  approverId = a.id;
  await prisma.membership.createMany({
    data: [
      { orgId, userId: creatorId, role: "ai_owner" },
      { orgId, userId: approverId, role: "risk_officer" },
    ],
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId,
      name: `UC ${Date.now()}`,
      ownerId: creatorId,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  usecaseId = uc.id;
});

afterAll(async () => {
  await prisma.usecaseFria.deleteMany({ where: { orgId } });
  await prisma.aiUsecase.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({
    where: { id: { in: [creatorId, approverId] } },
  });
  await prisma.organization.delete({ where: { id: orgId } });
});

beforeEach(async () => {
  await prisma.usecaseFria.deleteMany({ where: { orgId } });
});

const minSections = { system: { name: "Demo System" } };

describe("createFria", () => {
  it("creates draft v=1", async () => {
    const r = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
    });
    expect(r.status).toBe("draft");
    expect(r.version).toBe(1);
    expect(r.createdById).toBe(creatorId);
    expect(r.sectionsJson).toEqual({});
  });

  it("accepts initialSections", async () => {
    const r = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
      initialSections: minSections,
    });
    expect((r.sectionsJson as { system: { name: string } }).system.name).toBe(
      "Demo System",
    );
  });
});

describe("updateDraftSections", () => {
  it("updates draft", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
    });
    const r = await updateDraftSections({
      orgId,
      friaId: c.id,
      userId: creatorId,
      sections: minSections,
    });
    expect((r.sectionsJson as { system: { name: string } }).system.name).toBe(
      "Demo System",
    );
  });

  it("throws on non-draft", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
      initialSections: minSections,
    });
    await submitFria({ orgId, friaId: c.id, userId: creatorId });
    await expect(
      updateDraftSections({
        orgId,
        friaId: c.id,
        userId: creatorId,
        sections: minSections,
      }),
    ).rejects.toThrow(FriaStateError);
  });
});

describe("submitFria", () => {
  it("draft + non-empty system.name → submitted", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
      initialSections: minSections,
    });
    const r = await submitFria({ orgId, friaId: c.id, userId: creatorId });
    expect(r.status).toBe("submitted");
    expect(r.submittedAt).not.toBeNull();
    expect(r.submittedById).toBe(creatorId);
  });

  it("empty system.name → throws", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
    });
    await expect(
      submitFria({ orgId, friaId: c.id, userId: creatorId }),
    ).rejects.toThrow(/system\.name/);
  });

  it("non-draft → throws", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
      initialSections: minSections,
    });
    await submitFria({ orgId, friaId: c.id, userId: creatorId });
    await expect(
      submitFria({ orgId, friaId: c.id, userId: creatorId }),
    ).rejects.toThrow(FriaStateError);
  });
});

describe("withdrawFria", () => {
  it("submitted → draft", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
      initialSections: minSections,
    });
    await submitFria({ orgId, friaId: c.id, userId: creatorId });
    const r = await withdrawFria({ orgId, friaId: c.id, userId: creatorId });
    expect(r.status).toBe("draft");
    expect(r.submittedAt).toBeNull();
  });

  it("non-submitted → throws", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
    });
    await expect(
      withdrawFria({ orgId, friaId: c.id, userId: creatorId }),
    ).rejects.toThrow(FriaStateError);
  });
});

describe("approveFria", () => {
  it("submitted + approver ≠ creator → approved", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
      initialSections: minSections,
    });
    await submitFria({ orgId, friaId: c.id, userId: creatorId });
    const r = await approveFria({ orgId, friaId: c.id, userId: approverId });
    expect(r.status).toBe("approved");
    expect(r.approvedById).toBe(approverId);
  });

  it("approver = creator → throws", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
      initialSections: minSections,
    });
    await submitFria({ orgId, friaId: c.id, userId: creatorId });
    await expect(
      approveFria({ orgId, friaId: c.id, userId: creatorId }),
    ).rejects.toThrow(/self/i);
  });

  it("non-submitted → throws", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
    });
    await expect(
      approveFria({ orgId, friaId: c.id, userId: approverId }),
    ).rejects.toThrow(FriaStateError);
  });
});

describe("supersedeFria", () => {
  it("approved → archive old + create new v+1 draft with copied sections", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
      initialSections: minSections,
    });
    await submitFria({ orgId, friaId: c.id, userId: creatorId });
    await approveFria({ orgId, friaId: c.id, userId: approverId });

    const r = await supersedeFria({ orgId, friaId: c.id, userId: creatorId });
    expect(r.archived.status).toBe("archived");
    expect(r.archived.supersededById).toBe(r.created.id);
    expect(r.created.status).toBe("draft");
    expect(r.created.version).toBe(2);
    expect(
      (r.created.sectionsJson as { system: { name: string } }).system.name,
    ).toBe("Demo System");
  });

  it("non-approved → throws", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
    });
    await expect(
      supersedeFria({ orgId, friaId: c.id, userId: creatorId }),
    ).rejects.toThrow(FriaStateError);
  });
});

describe("archiveFria", () => {
  it("approved → archived", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
      initialSections: minSections,
    });
    await submitFria({ orgId, friaId: c.id, userId: creatorId });
    await approveFria({ orgId, friaId: c.id, userId: approverId });
    const r = await archiveFria({ orgId, friaId: c.id, userId: approverId });
    expect(r.status).toBe("archived");
    expect(r.archivedById).toBe(approverId);
  });

  it("non-approved → throws", async () => {
    const c = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T",
    });
    await expect(
      archiveFria({ orgId, friaId: c.id, userId: approverId }),
    ).rejects.toThrow(FriaStateError);
  });
});

describe("listFriasForUsecase", () => {
  it("none → { current: null, history: [] }", async () => {
    const r = await listFriasForUsecase({ orgId, usecaseId });
    expect(r.current).toBeNull();
    expect(r.history).toEqual([]);
  });

  it("returns current = non-archived latest, history = archived in version desc", async () => {
    const c1 = await createFria({
      orgId,
      usecaseId,
      userId: creatorId,
      title: "T1",
      initialSections: minSections,
    });
    await submitFria({ orgId, friaId: c1.id, userId: creatorId });
    await approveFria({ orgId, friaId: c1.id, userId: approverId });
    await supersedeFria({ orgId, friaId: c1.id, userId: creatorId });

    const r = await listFriasForUsecase({ orgId, usecaseId });
    expect(r.current?.version).toBe(2);
    expect(r.current?.status).toBe("draft");
    expect(r.history).toHaveLength(1);
    expect(r.history[0].version).toBe(1);
    expect(r.history[0].status).toBe("archived");
  });
});
