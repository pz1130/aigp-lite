// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { createRedteamAttestation } from "@/lib/redteam/attestation";
import { retrieve } from "@/lib/storage";

const TAG = "RTA-DL";

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("attestation download storage round-trip", () => {
  it("retrieve() returns the stored PDF bytes for the org's row", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `dl-${Date.now()}@t.local`,
        name: "DL",
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
    const { id } = await createRedteamAttestation({
      db: withOrg(prisma, org.id),
      orgId: org.id,
      userId: user.id,
      file: {
        buffer: Buffer.from("%PDF-1.4\nround-trip\n"),
        filename: "r.pdf",
        mimeType: "application/pdf",
      },
      fields: {
        usecaseId: uc.id,
        attesterName: "A",
        scope: "s",
        attestedAt: "2026-07-01T00:00:00.000Z",
      },
    });
    const row = await prisma.redteamAttestation.findUnique({ where: { id } });
    const buf = await retrieve(row!.storageKey);
    expect(buf.toString()).toContain("round-trip");
  });
});
