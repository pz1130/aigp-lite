import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { validateSsoBoot } from "./boot";
import { isSsoEnabled, __resetBootFlagForTests } from "./config";

const ORIG = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIG };
  __resetBootFlagForTests();
  vi.restoreAllMocks();
});
afterEach(() => {
  process.env = ORIG;
  __resetBootFlagForTests();
});

describe("validateSsoBoot", () => {
  it("does nothing when env is missing", async () => {
    delete process.env.SSO_OIDC_ISSUER;
    await validateSsoBoot();
    expect(isSsoEnabled()).toBe(false);
  });

  it("disables when issuer is not a valid URL", async () => {
    process.env.SSO_OIDC_ISSUER = "not a url";
    process.env.SSO_OIDC_CLIENT_ID = "cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "sec";
    process.env.SSO_OIDC_ORG_ID = "org_abc";
    await validateSsoBoot();
    expect(isSsoEnabled()).toBe(false);
  });

  it("disables when org does not exist", async () => {
    process.env.SSO_OIDC_ISSUER = "https://idp.example.com";
    process.env.SSO_OIDC_CLIENT_ID = "cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "sec";
    process.env.SSO_OIDC_ORG_ID = "org_does_not_exist_xyz";
    await validateSsoBoot();
    expect(isSsoEnabled()).toBe(false);
  });

  it("enables when env valid and org exists", async () => {
    const org = await prisma.organization.create({
      data: { name: "SSO-Org-" + Date.now() },
    });
    process.env.SSO_OIDC_ISSUER = "https://idp.example.com";
    process.env.SSO_OIDC_CLIENT_ID = "cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "sec";
    process.env.SSO_OIDC_ORG_ID = org.id;
    await validateSsoBoot();
    expect(isSsoEnabled()).toBe(true);
  });
});
