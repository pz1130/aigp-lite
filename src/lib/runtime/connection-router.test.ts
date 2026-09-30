// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { connectionRouter } from "./connection-router";
import { encryptJson, decryptJson } from "@/lib/crypto/secrets";
import type { Role } from "@/lib/rbac/roles";

// Creation-time egress guard resolves hostnames; pin DNS to a public IP.
vi.mock("node:dns/promises", () => {
  const lookup = vi
    .fn()
    .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  return { default: { lookup }, lookup };
});

const ORG = "org-test-m8";
const USER = "user-test-m8";

async function ensureOrg() {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "Test Org" },
  });
}

beforeAll(async () => {
  await prisma.membership.deleteMany({ where: { orgId: ORG } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: USER } }).catch(() => {});
  await prisma.organization.deleteMany({ where: { id: ORG } }).catch(() => {});

  await prisma.organization.create({ data: { id: ORG, name: "Test Org" } });
  const hash = await hashPassword("testtest");
  const user = await prisma.user.create({
    data: { id: USER, email: "t@t", name: "tester", passwordHash: hash },
  });
  await prisma.membership.create({
    data: { orgId: ORG, userId: user.id, role: "admin" },
  });
});

afterAll(async () => {
  await prisma.providerConnection
    .deleteMany({ where: { orgId: ORG } })
    .catch(() => {});
  await prisma.membership.deleteMany({ where: { orgId: ORG } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: USER } }).catch(() => {});
  await prisma.organization.deleteMany({ where: { id: ORG } }).catch(() => {});
});

function caller(role: Role = "admin") {
  return connectionRouter.createCaller({
    session: { orgId: ORG, userId: USER, role, email: "t@t" },
    ip: "127.0.0.1",
    userAgent: "test",
  });
}

async function dbDeleteAll() {
  try {
    await prisma.providerConnection.deleteMany({ where: { orgId: ORG } });
  } catch {
    // table may not exist yet in test db
  }
}

describe("connectionRouter — read", () => {
  beforeEach(async () => {
    await dbDeleteAll();
    await ensureOrg();
  });
  afterEach(async () => {
    await dbDeleteAll();
  });

  it("list returns rows for current org and strips credentials", async () => {
    await prisma.providerConnection.create({
      data: {
        orgId: ORG,
        name: "p1",
        providerType: "openai",
        baseUrl: "https://api.openai.com/v1",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ apiKey: "sk-test" }),
        ),
        config: {},
        createdBy: USER,
      },
    });
    const rows = await caller().list();
    expect(rows.length).toBe(1);
    expect(rows[0]).not.toHaveProperty("credentialsEncrypted");
    expect(rows[0].name).toBe("p1");
  });

  it("get returns single row by id, strips credentials", async () => {
    await prisma.providerConnection.create({
      data: {
        orgId: ORG,
        name: "p1",
        providerType: "openai",
        baseUrl: "https://api.openai.com/v1",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ apiKey: "sk-test" }),
        ),
        config: {},
        createdBy: USER,
      },
    });
    const [row] = await caller().list();
    const got = await caller().get({ id: row.id });
    expect(got.name).toBe("p1");
    expect(got).not.toHaveProperty("credentialsEncrypted");
  });

  it("catalog returns the static catalog", async () => {
    const cat = await caller().catalog();
    expect(cat.length).toBeGreaterThanOrEqual(13);
    expect(cat.find((e) => e.slug === "deepseek")).toBeTruthy();
  });
});

describe("connectionRouter — write", () => {
  beforeEach(async () => {
    await dbDeleteAll();
    await ensureOrg();
  });
  afterEach(async () => {
    await dbDeleteAll();
  });

  it("create writes encrypted credentials and ProviderConnection", async () => {
    const out = await caller().create({
      catalogSlug: "deepseek",
      name: "ds-prod",
      credentials: { apiKey: "sk-deepseek-xxx" },
      config: {},
    });
    expect(out.name).toBe("ds-prod");
    const row = await prisma.providerConnection.findUniqueOrThrow({
      where: { id: out.id },
    });
    expect(
      decryptJson<{ apiKey: string }>(row.credentialsEncrypted).apiKey,
    ).toBe("sk-deepseek-xxx");
  });

  it("create rejects when caller lacks provider.write", async () => {
    await expect(
      caller("viewer").create({
        catalogSlug: "deepseek",
        name: "x",
        credentials: { apiKey: "k" },
        config: {},
      }),
    ).rejects.toThrow(/lacks "provider.write"/);
  });

  it("create rejects unknown catalogSlug", async () => {
    await expect(
      caller().create({
        catalogSlug: "not-a-real-slug",
        name: "x",
        credentials: { apiKey: "k" },
        config: {},
      }),
    ).rejects.toThrow(/unknown/);
  });

  it("create rejects empty credentials value", async () => {
    await expect(
      caller().create({
        catalogSlug: "deepseek",
        name: "x",
        credentials: { apiKey: "" },
        config: {},
      }),
    ).rejects.toThrow();
  });

  it("update preserves credentialsEncrypted when credentials omitted", async () => {
    const created = await caller().create({
      catalogSlug: "deepseek",
      name: "ds",
      credentials: { apiKey: "old" },
      config: {},
    });
    const before = await prisma.providerConnection.findUniqueOrThrow({
      where: { id: created.id },
    });
    await caller().update({ id: created.id, name: "ds-renamed" });
    const after = await prisma.providerConnection.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.name).toBe("ds-renamed");
    expect(
      Buffer.compare(after.credentialsEncrypted, before.credentialsEncrypted),
    ).toBe(0);
  });

  it("update overwrites credentials when provided", async () => {
    const created = await caller().create({
      catalogSlug: "deepseek",
      name: "ds",
      credentials: { apiKey: "old" },
      config: {},
    });
    await caller().update({ id: created.id, credentials: { apiKey: "new" } });
    const after = await prisma.providerConnection.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(
      decryptJson<{ apiKey: string }>(after.credentialsEncrypted).apiKey,
    ).toBe("new");
  });

  it("delete removes row; cross-tenant get returns NOT_FOUND", async () => {
    const created = await caller().create({
      catalogSlug: "deepseek",
      name: "ds",
      credentials: { apiKey: "k" },
      config: {},
    });
    await caller().delete({ id: created.id });
    await expect(caller().get({ id: created.id })).rejects.toThrow(/not found/);
  });

  it("cross-tenant access rejected", async () => {
    const created = await caller().create({
      catalogSlug: "deepseek",
      name: "x",
      credentials: { apiKey: "k" },
      config: {},
    });
    const otherOrg = connectionRouter.createCaller({
      session: { orgId: "other-org", userId: "u", role: "admin", email: "a@b" },
    });
    await expect(otherOrg.get({ id: created.id })).rejects.toThrow(/not found/);
  });
});

describe("connectionRouter — egress guard", () => {
  beforeEach(async () => {
    await dbDeleteAll();
    await ensureOrg();
  });
  afterEach(async () => {
    await dbDeleteAll();
  });

  it("create rejects a private baseUrl", async () => {
    await expect(
      caller().create({
        catalogSlug: "deepseek",
        name: "evil",
        credentials: { apiKey: "k" },
        config: {},
        baseUrl: "http://169.254.169.254/v1",
      }),
    ).rejects.toThrow(/Egress blocked/);
  });

  it("update rejects a private baseUrl", async () => {
    const created = await caller().create({
      catalogSlug: "deepseek",
      name: "ds",
      credentials: { apiKey: "k" },
      config: {},
    });
    await expect(
      caller().update({ id: created.id, baseUrl: "http://127.0.0.1:8080/v1" }),
    ).rejects.toThrow(/AIGP_EGRESS_ALLOWLIST/);
  });
});
