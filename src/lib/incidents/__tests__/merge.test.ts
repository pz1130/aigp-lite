import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { incidentRouter } from "@/lib/incident/router";
import { SYSTEM_USER_ID } from "@/lib/auth/system-user";

let ORG: string;
let USER: string;

function ctxFor() {
  return {
    db: prisma,
    session: { orgId: ORG, userId: USER, role: "admin" as const },
    ip: "127.0.0.1",
  } as never;
}

beforeAll(async () => {
  ORG = `org-merge-${Date.now()}`;
  USER = `u-merge-${Date.now()}`;
  await prisma.organization.create({ data: { id: ORG, name: "T" } });
  await prisma.user.create({
    data: { id: USER, email: `${USER}@t`, name: "U", passwordHash: "x" },
  });
  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    create: {
      id: SYSTEM_USER_ID,
      email: "system@internal",
      name: "System",
      passwordHash: "x",
    },
    update: {},
  });
  await prisma.membership.create({
    data: { orgId: ORG, userId: USER, role: "admin" },
  });
});

afterAll(async () => {
  await prisma.incidentRcaDraft.deleteMany({ where: { orgId: ORG } });
  await prisma.incidentMergeSuggestion.deleteMany({ where: { orgId: ORG } });
  await prisma.incident.deleteMany({ where: { orgId: ORG } });
  await prisma.incident.deleteMany({ where: { openedById: USER } });
  await prisma.membership.deleteMany({ where: { orgId: ORG, userId: USER } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
  await prisma.user.deleteMany({ where: { id: USER } }); // must be last — incidents FK to user via openedById
});

beforeEach(async () => {
  await prisma.incidentRcaDraft.deleteMany({ where: { orgId: ORG } });
  await prisma.incidentMergeSuggestion.deleteMany({ where: { orgId: ORG } });
  await prisma.incident.deleteMany({ where: { orgId: ORG } });
});

describe("incidentRouter.mergeInto", () => {
  it("marks source merged + closed and writes suggestion acceptance", async () => {
    const target = await prisma.incident.create({
      data: { orgId: ORG, title: "T", openedById: USER },
    });
    const source = await prisma.incident.create({
      data: { orgId: ORG, title: "S", openedById: USER },
    });
    const sug = await prisma.incidentMergeSuggestion.create({
      data: {
        orgId: ORG,
        incidentId: source.id,
        candidateIncidentId: target.id,
        similarity: 0.9,
      },
    });
    const caller = incidentRouter.createCaller(ctxFor());
    await caller.mergeInto({ sourceId: source.id, targetId: target.id });
    const after = await prisma.incident.findUnique({
      where: { id: source.id },
    });
    expect(after?.mergedIntoId).toBe(target.id);
    expect(after?.status).toBe("closed");
    expect(after?.closedAt).not.toBeNull();
    const sugAfter = await prisma.incidentMergeSuggestion.findUnique({
      where: { id: sug.id },
    });
    expect(sugAfter?.acceptedAt).not.toBeNull();
    expect(sugAfter?.acceptedById).toBe(USER);
  });

  it("reassigns RCA drafts to the target", async () => {
    const target = await prisma.incident.create({
      data: { orgId: ORG, title: "T", openedById: USER },
    });
    const source = await prisma.incident.create({
      data: { orgId: ORG, title: "S", openedById: USER },
    });
    await prisma.incidentRcaDraft.create({
      data: {
        orgId: ORG,
        incidentId: source.id,
        status: "ok",
        providerType: "openai",
        model: "m",
        rawOutput: {},
        requestedById: USER,
      },
    });
    const caller = incidentRouter.createCaller(ctxFor());
    await caller.mergeInto({ sourceId: source.id, targetId: target.id });
    const drafts = await prisma.incidentRcaDraft.findMany({
      where: { orgId: ORG },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].incidentId).toBe(target.id);
  });

  it("refuses to merge across orgs", async () => {
    const target = await prisma.incident.create({
      data: { orgId: ORG, title: "T", openedById: USER },
    });
    await prisma.organization.create({ data: { id: "other-org", name: "X" } });
    const source = await prisma.incident.create({
      data: { orgId: "other-org", title: "S", openedById: USER },
    });
    const caller = incidentRouter.createCaller(ctxFor());
    await expect(
      caller.mergeInto({ sourceId: source.id, targetId: target.id }),
    ).rejects.toThrow();
  });
});

describe("incidentRouter.dismissSuggestion", () => {
  it("stamps dismissedAt + dismissedById", async () => {
    const a = await prisma.incident.create({
      data: { orgId: ORG, title: "A", openedById: USER },
    });
    const b = await prisma.incident.create({
      data: { orgId: ORG, title: "B", openedById: USER },
    });
    const sug = await prisma.incidentMergeSuggestion.create({
      data: {
        orgId: ORG,
        incidentId: a.id,
        candidateIncidentId: b.id,
        similarity: 0.9,
      },
    });
    const caller = incidentRouter.createCaller(ctxFor());
    await caller.dismissSuggestion({ id: sug.id });
    const after = await prisma.incidentMergeSuggestion.findUnique({
      where: { id: sug.id },
    });
    expect(after?.dismissedAt).not.toBeNull();
    expect(after?.dismissedById).toBe(USER);
  });
});

describe("incidentRouter.list", () => {
  it("excludes merged incidents by default", async () => {
    const target = await prisma.incident.create({
      data: { orgId: ORG, title: "T", openedById: USER },
    });
    await prisma.incident.create({
      data: {
        orgId: ORG,
        title: "S",
        openedById: USER,
        mergedIntoId: target.id,
        status: "closed",
      },
    });
    const caller = incidentRouter.createCaller(ctxFor());
    const rows = await caller.list({});
    expect(rows.map((r) => r.title)).toEqual(["T"]);
  });

  it("includes merged when showMerged=true", async () => {
    const target = await prisma.incident.create({
      data: { orgId: ORG, title: "T", openedById: USER },
    });
    await prisma.incident.create({
      data: {
        orgId: ORG,
        title: "S",
        openedById: USER,
        mergedIntoId: target.id,
        status: "closed",
      },
    });
    const caller = incidentRouter.createCaller(ctxFor());
    const rows = await caller.list({ showMerged: true });
    expect(rows.length).toBe(2);
  });
});
