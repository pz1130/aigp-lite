// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import {
  createRedteamAttestation,
  AttestationError,
} from "@/lib/redteam/attestation";

const TAG = "RTA-CREATE";

function pdf(): { buffer: Buffer; filename: string; mimeType: string } {
  return {
    buffer: Buffer.from("%PDF-1.4\n%mock\n"),
    filename: "report.pdf",
    mimeType: "application/pdf",
  };
}

async function seed() {
  const org = await prisma.organization.create({
    data: { name: `${TAG}-${Date.now()}-${Math.random()}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `rta-${Date.now()}-${Math.random()}@t.local`,
      name: "RTA",
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

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("createRedteamAttestation", () => {
  it("stores the file, creates the row, and writes an audit", async () => {
    const { org, user, uc } = await seed();
    const res = await createRedteamAttestation({
      db: withOrg(prisma, org.id),
      orgId: org.id,
      userId: user.id,
      file: pdf(),
      fields: {
        usecaseId: uc.id,
        attesterName: "Trail of Bits",
        scope: "Prompt-injection + tool abuse",
        attestedAt: "2026-07-01T00:00:00.000Z",
      },
    });
    const row = await prisma.redteamAttestation.findUnique({
      where: { id: res.id },
    });
    expect(row).not.toBeNull();
    expect(row!.attesterName).toBe("Trail of Bits");
    expect(row!.reportSha256).toHaveLength(64);
    expect(row!.reportBytes).toBeGreaterThan(0);
    const audit = await prisma.auditLog.findFirst({
      where: { resourceId: res.id, action: "redteam_attestation.created" },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects a non-PDF upload with status 400", async () => {
    const { org, user, uc } = await seed();
    await expect(
      createRedteamAttestation({
        db: withOrg(prisma, org.id),
        orgId: org.id,
        userId: user.id,
        file: {
          buffer: Buffer.from("hi"),
          filename: "notes.txt",
          mimeType: "text/plain",
        },
        fields: {
          usecaseId: uc.id,
          attesterName: "X",
          scope: "s",
          attestedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an evaluationId from another usecase with status 400", async () => {
    const { org, user, uc } = await seed();
    const otherUc = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: `${TAG}-uc2`,
        ownerId: user.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    const conn = await prisma.providerConnection.create({
      data: {
        orgId: org.id,
        name: "c",
        providerType: "openai",
        baseUrl: "https://x",
        credentialsEncrypted: Buffer.from("x"),
        createdBy: user.id,
      },
    });
    const evalRow = await prisma.evaluation.create({
      data: {
        orgId: org.id,
        usecaseId: otherUc.id,
        connectionId: conn.id,
        model: "m",
        createdBy: user.id,
      },
    });
    await expect(
      createRedteamAttestation({
        db: withOrg(prisma, org.id),
        orgId: org.id,
        userId: user.id,
        file: pdf(),
        fields: {
          usecaseId: uc.id,
          evaluationId: evalRow.id,
          attesterName: "X",
          scope: "s",
          attestedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    ).rejects.toBeInstanceOf(AttestationError);
  });

  it("rejects an unknown usecase with status 404", async () => {
    const { org, user } = await seed();
    await expect(
      createRedteamAttestation({
        db: withOrg(prisma, org.id),
        orgId: org.id,
        userId: user.id,
        file: pdf(),
        fields: {
          usecaseId: "does-not-exist",
          attesterName: "X",
          scope: "s",
          attestedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
