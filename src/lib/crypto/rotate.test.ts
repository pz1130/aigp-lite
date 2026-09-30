// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { encryptJsonWithKey, decryptJsonWithKey } from "./secrets";
import { rotateBlob, rotateAllTables } from "./rotate";

const OLD_KEY = Buffer.alloc(32, 1);
const NEW_KEY = Buffer.alloc(32, 2);

describe("rotateBlob", () => {
  it("re-encrypts an old-key blob so it decrypts with the new key", () => {
    const blob = encryptJsonWithKey(OLD_KEY, { apiKey: "sk-1" });
    const res = rotateBlob(blob, OLD_KEY, NEW_KEY);
    expect(res.action).toBe("rotated");
    if (res.action !== "rotated") throw new Error("unreachable");
    expect(decryptJsonWithKey(NEW_KEY, res.blob)).toEqual({ apiKey: "sk-1" });
    // and the old key no longer opens the new blob
    expect(() => decryptJsonWithKey(OLD_KEY, res.blob)).toThrow();
  });

  it("reports 'already' for a blob encrypted with the new key (idempotent)", () => {
    const blob = encryptJsonWithKey(NEW_KEY, { apiKey: "sk-2" });
    expect(rotateBlob(blob, OLD_KEY, NEW_KEY)).toEqual({ action: "already" });
  });

  it("reports 'failed' for a blob neither key can decrypt", () => {
    const garbage = Buffer.from("definitely-not-a-valid-gcm-blob-0123456789");
    expect(rotateBlob(garbage, OLD_KEY, NEW_KEY)).toEqual({ action: "failed" });
  });
});

describe("rotateAllTables (DB)", () => {
  let orgId: string;
  let sinkId: string;
  let nullSinkId: string;
  let provId: string;
  let integId: string;
  let garbageId: string;
  let ssoId: string;

  const GARBAGE = Buffer.from("definitely-not-a-valid-gcm-blob-0123456789");

  beforeEach(async () => {
    // rotateAllTables scans whole tables, so counts are only deterministic
    // on a clean slate. All 4 tables' children are Cascade/SetNull — safe.
    await prisma.auditSink.deleteMany({});
    await prisma.providerConnection.deleteMany({});
    await prisma.enterpriseIntegration.deleteMany({});
    await prisma.ssoConnection.deleteMany({});
    const org = await prisma.organization.create({
      data: { name: "Rotate-Test-" + Date.now() },
    });
    orgId = org.id;
    sinkId = (
      await prisma.auditSink.create({
        data: {
          orgId,
          name: "sink",
          type: "webhook",
          url: "https://hec.example.com",
          secretsEncrypted: new Uint8Array(
            encryptJsonWithKey(OLD_KEY, { token: "hec-1" }),
          ),
        },
      })
    ).id;
    nullSinkId = (
      await prisma.auditSink.create({
        data: {
          orgId,
          name: "sink-no-secret",
          type: "webhook",
          url: "https://hec.example.com",
        },
      })
    ).id;
    provId = (
      await prisma.providerConnection.create({
        data: {
          orgId,
          name: "prov",
          providerType: "openai_compatible",
          credentialsEncrypted: new Uint8Array(
            encryptJsonWithKey(OLD_KEY, { apiKey: "k1" }),
          ),
          createdBy: "rotate-test",
        },
      })
    ).id;
    integId = (
      await prisma.enterpriseIntegration.create({
        data: {
          orgId,
          name: "slack",
          integrationType: "slack_webhook",
          credentialsEncrypted: new Uint8Array(
            encryptJsonWithKey(OLD_KEY, {
              webhookUrl: "https://hooks.example.com",
            }),
          ),
          subscribedEvents: [],
          createdBy: "rotate-test",
        },
      })
    ).id;
    garbageId = (
      await prisma.enterpriseIntegration.create({
        data: {
          orgId,
          name: "garbage",
          integrationType: "slack_webhook",
          credentialsEncrypted: GARBAGE,
          subscribedEvents: [],
          createdBy: "rotate-test",
        },
      })
    ).id;
    ssoId = (
      await prisma.ssoConnection.create({
        data: {
          orgId,
          issuer: "https://idp.example.com",
          clientId: "cid",
          clientSecretEncrypted: new Uint8Array(
            encryptJsonWithKey(OLD_KEY, "oidc-secret"),
          ),
        },
      })
    ).id;
  });

  afterAll(async () => {
    // Cascade-deletes all rows seeded above so later suite files see a clean slate.
    await prisma.organization.deleteMany({
      where: { name: { startsWith: "Rotate-Test-" } },
    });
  });

  function byTable(results: Awaited<ReturnType<typeof rotateAllTables>>) {
    return Object.fromEntries(results.map((r) => [r.table, r]));
  }

  it("dry-run reports counts without writing anything", async () => {
    const t = byTable(
      await rotateAllTables(OLD_KEY, NEW_KEY, { dryRun: true }),
    );
    expect(t.audit_sink).toMatchObject({ rotated: 1, already: 0, failed: [] });
    expect(t.provider_connection).toMatchObject({ rotated: 1, already: 0 });
    expect(t.enterprise_integration).toMatchObject({
      rotated: 1,
      already: 0,
      failed: [garbageId],
    });
    expect(t.sso_connection).toMatchObject({ rotated: 1, already: 0 });
    // nothing written: the old key still opens the stored blob
    const sink = await prisma.auditSink.findUniqueOrThrow({
      where: { id: sinkId },
    });
    expect(
      decryptJsonWithKey(OLD_KEY, Buffer.from(sink.secretsEncrypted!)),
    ).toEqual({ token: "hec-1" });
  });

  it("rotates every old-key row, skips NULLs, reports garbage as failed", async () => {
    const t = byTable(
      await rotateAllTables(OLD_KEY, NEW_KEY, { dryRun: false }),
    );
    expect(t.audit_sink).toMatchObject({ rotated: 1, already: 0, failed: [] });
    expect(t.provider_connection).toMatchObject({ rotated: 1, failed: [] });
    expect(t.enterprise_integration).toMatchObject({
      rotated: 1,
      failed: [garbageId],
    });
    expect(t.sso_connection).toMatchObject({ rotated: 1, failed: [] });

    const sink = await prisma.auditSink.findUniqueOrThrow({
      where: { id: sinkId },
    });
    expect(
      decryptJsonWithKey(NEW_KEY, Buffer.from(sink.secretsEncrypted!)),
    ).toEqual({ token: "hec-1" });
    const nullSink = await prisma.auditSink.findUniqueOrThrow({
      where: { id: nullSinkId },
    });
    expect(nullSink.secretsEncrypted).toBeNull();
    const prov = await prisma.providerConnection.findUniqueOrThrow({
      where: { id: provId },
    });
    expect(
      decryptJsonWithKey(NEW_KEY, Buffer.from(prov.credentialsEncrypted)),
    ).toEqual({ apiKey: "k1" });
    const integ = await prisma.enterpriseIntegration.findUniqueOrThrow({
      where: { id: integId },
    });
    expect(
      decryptJsonWithKey(NEW_KEY, Buffer.from(integ.credentialsEncrypted)),
    ).toEqual({ webhookUrl: "https://hooks.example.com" });
    const garbage = await prisma.enterpriseIntegration.findUniqueOrThrow({
      where: { id: garbageId },
    });
    expect(Buffer.from(garbage.credentialsEncrypted).equals(GARBAGE)).toBe(
      true,
    );
    const sso = await prisma.ssoConnection.findUniqueOrThrow({
      where: { id: ssoId },
    });
    expect(
      decryptJsonWithKey(NEW_KEY, Buffer.from(sso.clientSecretEncrypted)),
    ).toBe("oidc-secret");
  });

  it("second run reports all rotated rows as already (resumable)", async () => {
    await rotateAllTables(OLD_KEY, NEW_KEY, { dryRun: false });
    const t = byTable(
      await rotateAllTables(OLD_KEY, NEW_KEY, { dryRun: false }),
    );
    expect(t.audit_sink).toMatchObject({ rotated: 0, already: 1, failed: [] });
    expect(t.provider_connection).toMatchObject({ rotated: 0, already: 1 });
    expect(t.enterprise_integration).toMatchObject({
      rotated: 0,
      already: 1,
      failed: [garbageId],
    });
    expect(t.sso_connection).toMatchObject({ rotated: 0, already: 1 });
  });
});
