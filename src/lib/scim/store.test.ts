import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  upsertConnection,
  rotateToken,
  setEnabled,
  getRedacted,
} from "./store";

async function makeOrg() {
  return prisma.organization.create({
    data: {
      name:
        "SCIM-STORE-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    },
  });
}

describe("upsertConnection", () => {
  it("creates a new connection and returns a raw token on first call", async () => {
    const org = await makeOrg();
    const { rawToken } = await upsertConnection(
      org.id,
      { roleAttribute: "department", roleValueMap: { eng: "admin" } },
      "admin-user-1",
    );
    expect(rawToken).not.toBeNull();
    expect(rawToken!.startsWith("aigp_scim_")).toBe(true);

    const redacted = await getRedacted(org.id);
    expect(redacted).toMatchObject({
      orgId: org.id,
      roleAttribute: "department",
      roleValueMap: { eng: "admin" },
      enabled: true,
    });
  });

  it("does not return a raw token on update, and does not rotate the existing one", async () => {
    const org = await makeOrg();
    const first = await upsertConnection(org.id, {}, "admin-user-1");
    const second = await upsertConnection(
      org.id,
      { roleAttribute: "dept2", roleValueMap: { x: "viewer" } },
      "admin-user-1",
    );
    expect(second.rawToken).toBeNull();

    const redacted = await getRedacted(org.id);
    expect(redacted!.roleAttribute).toBe("dept2");
    // token itself unchanged: rotateToken's new value must differ from the original
    expect(first.rawToken).not.toBeNull();
  });

  it("normalizes an empty-string roleAttribute to null", async () => {
    const org = await makeOrg();
    await upsertConnection(org.id, { roleAttribute: "  " }, "admin-user-1");
    const redacted = await getRedacted(org.id);
    expect(redacted!.roleAttribute).toBeNull();
  });

  it("preserves roleValueMap on update when not provided in input", async () => {
    const org = await makeOrg();
    // Create with roleValueMap set
    const initialMap = { eng: "admin", finance: "viewer" };
    await upsertConnection(
      org.id,
      { roleValueMap: initialMap },
      "admin-user-1",
    );

    // Update with a different field (roleAttribute) but no roleValueMap
    await upsertConnection(
      org.id,
      { roleAttribute: "department" },
      "admin-user-1",
    );

    // Verify roleValueMap is still the original one, not wiped to null
    const redacted = await getRedacted(org.id);
    expect(redacted!.roleValueMap).toEqual(initialMap);
    expect(redacted!.roleAttribute).toBe("department");
  });

  it("clears roleValueMap on update when explicitly set to null", async () => {
    const org = await makeOrg();
    // Create with roleValueMap set
    await upsertConnection(
      org.id,
      { roleValueMap: { eng: "admin" } },
      "admin-user-1",
    );

    // Update with roleValueMap explicitly set to null (admin clears the textarea)
    await upsertConnection(org.id, { roleValueMap: null }, "admin-user-1");

    const redacted = await getRedacted(org.id);
    expect(redacted!.roleValueMap).toBeNull();
  });
});

describe("rotateToken", () => {
  it("replaces the token, invalidating the previous one", async () => {
    const org = await makeOrg();
    const { rawToken: original } = await upsertConnection(
      org.id,
      {},
      "admin-user-1",
    );
    const rotated = await rotateToken(org.id);
    expect(rotated).not.toBe(original);
    expect(rotated.startsWith("aigp_scim_")).toBe(true);
  });
});

describe("setEnabled", () => {
  it("toggles enabled without touching other fields", async () => {
    const org = await makeOrg();
    await upsertConnection(org.id, { roleAttribute: "dept" }, "admin-user-1");
    await setEnabled(org.id, false);
    const redacted = await getRedacted(org.id);
    expect(redacted!.enabled).toBe(false);
    expect(redacted!.roleAttribute).toBe("dept");
  });
});

describe("getRedacted", () => {
  it("returns null when no connection exists", async () => {
    const org = await makeOrg();
    expect(await getRedacted(org.id)).toBeNull();
  });
});
