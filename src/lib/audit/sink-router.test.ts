// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import type { Role } from "@/lib/rbac/roles";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto/secrets";
import { forwardToSink } from "./forward";

vi.mock("./forward", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./forward")>();
  return { ...actual, forwardToSink: vi.fn().mockResolvedValue(undefined) };
});

// Creation-time egress guard resolves hostnames; pin DNS to a public IP so
// example.com fixtures don't hit the network.
vi.mock("node:dns/promises", () => {
  const lookup = vi
    .fn()
    .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  return { default: { lookup }, lookup };
});

const forwardMock = forwardToSink as unknown as ReturnType<typeof vi.fn>;

let orgId: string;
let userId: string;

function ctx(uid: string, role: Role): TRPCContext {
  return { session: { userId: uid, orgId, role, email: `${uid}@x` } };
}

function makeCaller() {
  return appRouter.createCaller(ctx(userId, "admin")).auditSink;
}

beforeAll(async () => {
  const o = await prisma.organization.create({
    data: { name: `ASR ${Date.now()}` },
  });
  orgId = o.id;
  const u = await prisma.user.create({
    data: { email: `asr-${Date.now()}@x`, name: "ASR", passwordHash: "x" },
  });
  userId = u.id;
  await prisma.membership.create({ data: { orgId, userId, role: "admin" } });
});

afterAll(async () => {
  await prisma.auditSink.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

beforeEach(async () => {
  await prisma.auditSink.deleteMany({ where: { orgId } });
  forwardMock.mockClear();
});

describe("auditSink secrets at rest", () => {
  it("encrypts webhook token at rest and never returns it", async () => {
    const caller = makeCaller();
    const created = await caller.create({
      type: "webhook",
      name: "splunk",
      url: "https://hec.example.com",
      token: "super-secret-token",
      enabled: true,
    });
    expect((created as Record<string, unknown>).token).toBeUndefined();
    expect(
      (created as Record<string, unknown>).secretsEncrypted,
    ).toBeUndefined();

    const row = await prisma.auditSink.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.secretsEncrypted).not.toBeNull();
    const secrets = decryptJson<{ token?: string }>(row.secretsEncrypted!);
    expect(secrets.token).toBe("super-secret-token");

    const got = await caller.get({ id: created.id });
    expect((got as Record<string, unknown>).secretsEncrypted).toBeUndefined();
    expect((got as Record<string, unknown>).token).toBeUndefined();
  });
});

describe("auditSink decrypt at forward time", () => {
  it("injects the decrypted plaintext token into the Sink passed to the transport", async () => {
    const caller = makeCaller();
    const created = await caller.create({
      type: "webhook",
      name: "splunk",
      url: "https://hec.example.com",
      token: "super-secret-token",
      enabled: true,
    });

    const res = await caller.test({ id: created.id });
    expect(res.ok).toBe(true);

    const testCall = forwardMock.mock.calls.find(
      (c) => (c[1] as { action: string }).action === "audit.sink.test",
    );
    expect(testCall).toBeDefined();
    const sinkArg = testCall![0] as { token?: string };
    expect(sinkArg.token).toBe("super-secret-token");
  });

  it("forwards without throwing when secretsEncrypted is a corrupt/undecryptable blob", async () => {
    const caller = makeCaller();
    const created = await caller.create({
      type: "webhook",
      name: "splunk",
      url: "https://hec.example.com",
      token: "super-secret-token",
      enabled: true,
    });

    // Simulate a corrupt blob (e.g. after key rotation or truncation): random
    // bytes long enough to pass the length check but fail the GCM auth tag.
    await prisma.auditSink.update({
      where: { id: created.id },
      data: {
        secretsEncrypted: Buffer.from(
          Array.from({ length: 40 }, (_, i) => (i * 37 + 11) % 256),
        ),
      },
    });

    const res = await caller.test({ id: created.id });
    expect(res.ok).toBe(true);

    const testCall = forwardMock.mock.calls.find(
      (c) => (c[1] as { action: string }).action === "audit.sink.test",
    );
    expect(testCall).toBeDefined();
    const sinkArg = testCall![0] as { token?: string; apiKey?: string };
    expect(sinkArg.token).toBeUndefined();
    expect(sinkArg.apiKey).toBeUndefined();
  });

  it("forwards without throwing when secretsEncrypted is null (no credentials)", async () => {
    const caller = makeCaller();
    const created = await caller.create({
      type: "syslog",
      name: "rsyslog",
      host: "logs.example.com",
      port: 514,
      protocol: "udp",
      enabled: true,
    });

    const row = await prisma.auditSink.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.secretsEncrypted).toBeNull();

    const res = await caller.test({ id: created.id });
    expect(res.ok).toBe(true);

    const testCall = forwardMock.mock.calls.find(
      (c) => (c[1] as { action: string }).action === "audit.sink.test",
    );
    expect(testCall).toBeDefined();
    const sinkArg = testCall![0] as { token?: string; apiKey?: string };
    expect(sinkArg.token).toBeUndefined();
    expect(sinkArg.apiKey).toBeUndefined();
  });
});

describe("auditSink egress guard at create", () => {
  it("rejects a webhook sink pointing at the cloud metadata endpoint", async () => {
    const caller = makeCaller();
    await expect(
      caller.create({
        type: "webhook",
        name: "evil",
        url: "http://169.254.169.254/latest/meta-data",
        enabled: true,
      }),
    ).rejects.toThrow(/Egress blocked/);
  });

  it("rejects a syslog sink pointing at a private host IP", async () => {
    const caller = makeCaller();
    await expect(
      caller.create({
        type: "syslog",
        name: "evil-syslog",
        host: "10.0.0.5",
        port: 514,
        protocol: "udp",
        enabled: true,
      }),
    ).rejects.toThrow(/AIGP_EGRESS_ALLOWLIST/);
  });
});
