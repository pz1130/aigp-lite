// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({ getSessionContext: vi.fn() }));
import { getSessionContext } from "@/lib/auth/session";
import { POST } from "./route";

let orgId: string;
let otherOrgId: string;
let userId: string;
let connId: string;

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/redteam/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeUsecase(oid: string) {
  return prisma.aiUsecase.create({
    data: {
      orgId: oid,
      name: `rt-uc-${Date.now()}-${Math.random()}`,
      ownerId: userId,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `RT ${Date.now()}` },
  });
  orgId = org.id;
  const o2 = await prisma.organization.create({
    data: { name: `RT2 ${Date.now()}` },
  });
  otherOrgId = o2.id;
  const u = await prisma.user.create({
    data: { email: `rt-${Date.now()}@x`, name: "U", passwordHash: "x" },
  });
  userId = u.id;
  const conn = await prisma.providerConnection.create({
    data: {
      orgId,
      name: "c1",
      providerType: "anthropic",
      credentialsEncrypted: Buffer.from("x"),
      createdBy: userId,
    },
  });
  connId = conn.id;
});

afterAll(async () => {
  await prisma.evaluation.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.aiUsecase.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.providerConnection.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.deleteMany({
    where: { id: { in: [orgId, otherOrgId] } },
  });
});

describe("POST /api/redteam/runs usecase linking", () => {
  it("persists usecaseId onto the Evaluation", async () => {
    const uc = await makeUsecase(orgId);
    vi.mocked(getSessionContext).mockResolvedValue({
      userId,
      orgId,
      role: "admin",
      email: "x@x",
    });
    const res = await POST(
      req({
        connectionId: connId,
        model: "gpt-test",
        promptSourceIds: ["builtin:x"],
        usecaseId: uc.id,
      }),
    );
    expect(res.status).toBe(200);
    const { evaluationId } = await res.json();
    const ev = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });
    expect(ev?.usecaseId).toBe(uc.id);
  });

  it("returns 404 for a foreign-org usecaseId", async () => {
    const uc = await makeUsecase(otherOrgId);
    vi.mocked(getSessionContext).mockResolvedValue({
      userId,
      orgId,
      role: "admin",
      email: "x@x",
    });
    const res = await POST(
      req({
        connectionId: connId,
        model: "gpt-test",
        promptSourceIds: ["builtin:x"],
        usecaseId: uc.id,
      }),
    );
    expect(res.status).toBe(404);
  });
});
