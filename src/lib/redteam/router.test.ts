// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { redteamRouter } from "./router";
import type { TRPCContext } from "@/lib/trpc/server";

const ORG_A = "rt-rt-A";
const ORG_B = "rt-rt-B";

let ctxAdmin: TRPCContext;
let ctxOwner: TRPCContext;
let ctxViewer: TRPCContext;
let ctxB: TRPCContext;
const userIds: string[] = [];
let usecaseId = "";

beforeAll(async () => {
  const pwd = await hashPassword("testtest");
  const uAdmin = await prisma.user.upsert({
    where: { email: "rt-admin@t" },
    update: {},
    create: { email: "rt-admin@t", name: "Adm", passwordHash: pwd },
  });
  const uOwner = await prisma.user.upsert({
    where: { email: "rt-owner@t" },
    update: {},
    create: { email: "rt-owner@t", name: "Own", passwordHash: pwd },
  });
  const uView = await prisma.user.upsert({
    where: { email: "rt-viewer@t" },
    update: {},
    create: { email: "rt-viewer@t", name: "Vw", passwordHash: pwd },
  });
  const uB = await prisma.user.upsert({
    where: { email: "rt-b@t" },
    update: {},
    create: { email: "rt-b@t", name: "B", passwordHash: pwd },
  });
  userIds.push(uAdmin.id, uOwner.id, uView.id, uB.id);

  await prisma.organization.upsert({
    where: { id: ORG_A },
    update: {},
    create: { id: ORG_A, name: "RT A" },
  });
  await prisma.organization.upsert({
    where: { id: ORG_B },
    update: {},
    create: { id: ORG_B, name: "RT B" },
  });

  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_A, userId: uAdmin.id } },
    update: {},
    create: { orgId: ORG_A, userId: uAdmin.id, role: "admin" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_A, userId: uOwner.id } },
    update: {},
    create: { orgId: ORG_A, userId: uOwner.id, role: "ai_owner" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_A, userId: uView.id } },
    update: {},
    create: { orgId: ORG_A, userId: uView.id, role: "viewer" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_B, userId: uB.id } },
    update: {},
    create: { orgId: ORG_B, userId: uB.id, role: "admin" },
  });

  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: ORG_A,
      name: "RT Router Usecase",
      ownerId: uAdmin.id,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "Router test usecase",
      modelCardMd: "limitations",
    },
  });
  usecaseId = uc.id;

  ctxAdmin = {
    session: {
      userId: uAdmin.id,
      email: uAdmin.email,
      orgId: ORG_A,
      role: "admin",
    },
  } as never;
  ctxOwner = {
    session: {
      userId: uOwner.id,
      email: uOwner.email,
      orgId: ORG_A,
      role: "ai_owner",
    },
  } as never;
  ctxViewer = {
    session: {
      userId: uView.id,
      email: uView.email,
      orgId: ORG_A,
      role: "viewer",
    },
  } as never;
  ctxB = {
    session: { userId: uB.id, email: uB.email, orgId: ORG_B, role: "admin" },
  } as never;
});

afterAll(async () => {
  await prisma.redteamPromptCustom.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.evaluationFinding.deleteMany({
    where: { evaluation: { orgId: { in: [ORG_A, ORG_B] } } },
  });
  await prisma.evaluation.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.aiUsecase.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.auditLog.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.membership.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.organization.deleteMany({
    where: { id: { in: [ORG_A, ORG_B] } },
  });
});

beforeEach(async () => {
  await prisma.redteamPromptCustom.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
});

describe("redteam.library.builtin", () => {
  it("returns category counts and prompt list without text", async () => {
    const caller = redteamRouter.createCaller(ctxOwner as never);
    const out = await caller.library.builtin();
    expect(out.total).toBeGreaterThanOrEqual(200);
    expect(out.countsByCategory.jailbreak).toBeGreaterThan(0);
    expect(
      (out.prompts[0] as unknown as { text?: string }).text,
    ).toBeUndefined();
  });

  it("exposes engineEnabled on the builtin query", async () => {
    const caller = redteamRouter.createCaller(ctxOwner as never);
    const res = await caller.library.builtin();
    expect(typeof res.engineEnabled).toBe("boolean");
  });

  it("builtinDetail returns full prompt for known slug", async () => {
    const caller = redteamRouter.createCaller(ctxOwner as never);
    const out = await caller.library.builtinDetail({
      slug: "jailbreak.dan-v1",
    });
    expect(out.text.length).toBeGreaterThan(0);
  });

  it("builtinDetail throws NOT_FOUND for unknown slug", async () => {
    const caller = redteamRouter.createCaller(ctxOwner as never);
    await expect(
      caller.library.builtinDetail({ slug: "nope.nope" }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("redteam.library.customUpload", () => {
  it("ai_owner uploads a JSONL set and rows are isolated to the org", async () => {
    const ownerCaller = redteamRouter.createCaller(ctxOwner as never);
    const out = await ownerCaller.library.customUpload({
      setName: "set-a",
      format: "jsonl",
      text: [
        `{"promptId":"p1","category":"jailbreak","severity":"high","text":"abcdef","checker":"refuses"}`,
        `{"promptId":"p2","category":"bias","severity":"medium","text":"abcdef","checker":"bias_neutral"}`,
      ].join("\n"),
    });
    expect(out.uploaded).toBe(2);

    const listA = await ownerCaller.library.customList({ setName: "set-a" });
    expect(listA).toHaveLength(2);

    const callerB = redteamRouter.createCaller(ctxB as never);
    const listB = await callerB.library.customList({ setName: "set-a" });
    expect(listB).toHaveLength(0);
  });

  it("rejects upload with row-numbered errors", async () => {
    const caller = redteamRouter.createCaller(ctxAdmin as never);
    await expect(
      caller.library.customUpload({
        setName: "set-bad",
        format: "jsonl",
        text: `{"promptId":"p1","category":"nope","severity":"high","text":"abcdef","checker":"refuses"}`,
      }),
    ).rejects.toThrow(/line 1.*category/);
  });

  it("viewer cannot upload", async () => {
    const caller = redteamRouter.createCaller(ctxViewer as never);
    await expect(
      caller.library.customUpload({
        setName: "denied",
        format: "jsonl",
        text: `{"promptId":"p1","category":"bias","severity":"high","text":"abcdef","checker":"bias_neutral"}`,
      }),
    ).rejects.toThrow(/redteam\.write/);
  });

  it("customUpload upserts on (orgId, setName, promptId) — re-uploading replaces", async () => {
    const caller = redteamRouter.createCaller(ctxAdmin as never);
    await caller.library.customUpload({
      setName: "set-upsert",
      format: "jsonl",
      text: `{"promptId":"p1","category":"jailbreak","severity":"low","text":"first","checker":"refuses"}`,
    });
    await caller.library.customUpload({
      setName: "set-upsert",
      format: "jsonl",
      text: `{"promptId":"p1","category":"jailbreak","severity":"critical","text":"second","checker":"refuses"}`,
    });
    const rows = await caller.library.customList({ setName: "set-upsert" });
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe("critical");
    expect(rows[0].text).toBe("second");
  });
});

describe("redteam.library.customDelete", () => {
  it("admin can delete a set, ai_owner cannot", async () => {
    const adminCaller = redteamRouter.createCaller(ctxAdmin as never);
    const ownerCaller = redteamRouter.createCaller(ctxOwner as never);
    await adminCaller.library.customUpload({
      setName: "set-del",
      format: "jsonl",
      text: `{"promptId":"p1","category":"bias","severity":"high","text":"abcdef","checker":"bias_neutral"}`,
    });

    await expect(
      ownerCaller.library.customDelete({ setName: "set-del" }),
    ).rejects.toThrow(/redteam\.delete/);
    const out = await adminCaller.library.customDelete({ setName: "set-del" });
    expect(out.deleted).toBe(1);
  });
});

describe("redteam.modelCard.generate", () => {
  it("markdown format returns the rendered string", async () => {
    const caller = redteamRouter.createCaller(ctxAdmin as never);
    const out = await caller.modelCard.generate({
      usecaseId,
      format: "markdown",
    });
    expect("markdown" in out ? out.markdown : "").toContain(
      "Model Card: RT Router Usecase",
    );
  });

  it("pdf format returns base64 starting with JVBE (%PDF)", async () => {
    // Disable the act env flag for this single call (same workaround as the
    // M9 / M12 PDF tests).
    const prev = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown })
      .IS_REACT_ACT_ENVIRONMENT;
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    try {
      const caller = redteamRouter.createCaller(ctxAdmin as never);
      const out = await caller.modelCard.generate({ usecaseId, format: "pdf" });
      expect("pdfBase64" in out ? (out.pdfBase64 ?? "").slice(0, 4) : "").toBe(
        "JVBE",
      );
    } finally {
      (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
      ).IS_REACT_ACT_ENVIRONMENT = prev;
    }
  });

  it("viewer cannot generate", async () => {
    const caller = redteamRouter.createCaller(ctxViewer as never);
    await expect(
      caller.modelCard.generate({ usecaseId, format: "markdown" }),
    ).rejects.toThrow(/redteam\.write/);
  });
});

describe("redteam.runs.get", () => {
  let evalId: string;
  let connId: string;

  beforeAll(async () => {
    const adminUser = await prisma.user.findFirstOrThrow({
      where: { email: "rt-admin@t" },
    });
    const conn = await prisma.providerConnection.create({
      data: {
        orgId: ORG_A,
        name: "RT test conn",
        providerType: "openai",
        credentialsEncrypted: Buffer.from("test"),
        isActive: true,
        createdBy: adminUser.id,
      },
    });
    connId = conn.id;

    const ev = await prisma.evaluation.create({
      data: {
        orgId: ORG_A,
        connectionId: conn.id,
        model: "gpt-4o",
        promptSourceIds: ["jailbreak", "toxicity"],
        status: "completed",
        createdBy: adminUser.id,
        totalPrompts: 2,
        passedCount: 1,
        failedCount: 1,
      },
    });
    evalId = ev.id;

    await prisma.evaluationFinding.createMany({
      data: [
        {
          evaluationId: ev.id,
          promptRef: "test-1",
          promptText: "test",
          category: "jailbreak",
          severity: "high",
          response: "no",
          judgment: "pass",
          latencyMs: 10,
        },
        {
          evaluationId: ev.id,
          promptRef: "test-2",
          promptText: "test",
          category: "toxicity",
          severity: "high",
          response: "bad",
          judgment: "fail",
          latencyMs: 10,
        },
      ],
    });
  });

  it("returns findings with imdaCoverage derived from categories", async () => {
    const caller = redteamRouter.createCaller(ctxAdmin as never);
    const out = await caller.runs.get({ id: evalId });
    expect(out.findings).toHaveLength(2);
    expect(out.imdaCoverage).toBeDefined();
    expect(out.imdaCoverage).toContain("Safety");
    expect(out.imdaCoverage).toContain("Toxicity");
  });

  afterAll(async () => {
    await prisma.evaluationFinding.deleteMany({
      where: { evaluationId: evalId },
    });
    await prisma.evaluation.deleteMany({ where: { id: evalId } });
    await prisma.providerConnection.deleteMany({ where: { id: connId } });
  });
});

describe("redteam.runs.linkSystem", () => {
  let evalId: string;
  let connId: string;
  let foreignUcId: string;

  beforeAll(async () => {
    const adminUser = await prisma.user.findFirstOrThrow({
      where: { email: "rt-admin@t" },
    });
    const conn = await prisma.providerConnection.create({
      data: {
        orgId: ORG_A,
        name: "RT link conn",
        providerType: "openai",
        credentialsEncrypted: Buffer.from("test"),
        isActive: true,
        createdBy: adminUser.id,
      },
    });
    connId = conn.id;
    const ev = await prisma.evaluation.create({
      data: {
        orgId: ORG_A,
        connectionId: conn.id,
        model: "gpt-4o",
        promptSourceIds: ["jailbreak"],
        status: "completed",
        createdBy: adminUser.id,
      },
    });
    evalId = ev.id;
    const foreignUc = await prisma.aiUsecase.create({
      data: {
        orgId: ORG_B,
        name: "Foreign system",
        ownerId: adminUser.id,
        lifecycleStage: "production",
        autonomyLevel: "assistant",
        deploymentType: "built",
        description: "foreign",
        modelCardMd: "x",
      },
    });
    foreignUcId = foreignUc.id;
  });

  it("sets usecaseId on an existing run", async () => {
    const caller = redteamRouter.createCaller(ctxAdmin as never);
    const out = await caller.runs.linkSystem({ id: evalId, usecaseId });
    expect(out.usecaseId).toBe(usecaseId);
    const reread = await prisma.evaluation.findUniqueOrThrow({
      where: { id: evalId },
    });
    expect(reread.usecaseId).toBe(usecaseId);
  });

  it("clears usecaseId when passed null", async () => {
    const caller = redteamRouter.createCaller(ctxAdmin as never);
    await caller.runs.linkSystem({ id: evalId, usecaseId });
    const out = await caller.runs.linkSystem({ id: evalId, usecaseId: null });
    expect(out.usecaseId).toBeNull();
  });

  it("rejects a foreign-org usecaseId and leaves the row unchanged", async () => {
    const caller = redteamRouter.createCaller(ctxAdmin as never);
    await caller.runs.linkSystem({ id: evalId, usecaseId: null });
    await expect(
      caller.runs.linkSystem({ id: evalId, usecaseId: foreignUcId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const reread = await prisma.evaluation.findUniqueOrThrow({
      where: { id: evalId },
    });
    expect(reread.usecaseId).toBeNull();
  });

  it("rejects an unknown run id", async () => {
    const caller = redteamRouter.createCaller(ctxAdmin as never);
    await expect(
      caller.runs.linkSystem({ id: "does-not-exist", usecaseId: null }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("forbids users without redteam.write", async () => {
    const caller = redteamRouter.createCaller(ctxViewer as never);
    await expect(
      caller.runs.linkSystem({ id: evalId, usecaseId }),
    ).rejects.toThrow(/redteam\.write/);
  });

  it("writes an audit row on a successful link", async () => {
    const caller = redteamRouter.createCaller(ctxAdmin as never);
    await caller.runs.linkSystem({ id: evalId, usecaseId });
    const audit = await prisma.auditLog.findFirst({
      where: { orgId: ORG_A, action: "redteam.run.link_system" },
      orderBy: { ts: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.resourceId).toBe(evalId);
  });

  afterAll(async () => {
    await prisma.evaluation.deleteMany({ where: { id: evalId } });
    await prisma.providerConnection.deleteMany({ where: { id: connId } });
    await prisma.aiUsecase.deleteMany({ where: { id: foreignUcId } });
  });
});
