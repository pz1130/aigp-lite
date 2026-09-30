// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as audit from "@/lib/audit/log";
import * as storage from "@/lib/storage";
import { generateTrustToken } from "@/lib/trust-center/token";
import { TRUST_COOKIE_NAME, signTrustCookie } from "@/lib/trust-center/cookie";
import { GET } from "./route";

const PDF = Buffer.from("%PDF-1.7 fake attestation");
const SHA = crypto.createHash("sha256").update(PDF).digest("hex");

async function scenario() {
  const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
  const org = await prisma.organization.create({
    data: { name: "TRUST-DL-" + suffix },
  });
  const user = await prisma.user.create({
    data: { email: `trust-dl-${suffix}@example.com`, name: "DL Tester" },
  });
  const slug = "dl" + suffix.replace(/[^a-z0-9]/gi, "").slice(0, 18);
  await prisma.trustProfile.create({
    data: { orgId: org.id, slug, enabled: true, displayName: "Acme" },
  });
  const attId = "att-" + suffix.replace(/[^a-z0-9]/gi, "");
  await prisma.trustSnapshot.create({
    data: {
      orgId: org.id,
      createdById: user.id,
      status: "published",
      version: 1,
      publishedAt: new Date(),
      publishedById: user.id,
      includedUsecaseIds: [],
      publicPayload: {},
      confidentialPayload: {
        attestations: [{ id: attId, attesterName: "ToB", reportSha256: SHA }],
      },
    },
  });
  const { hash, prefix } = generateTrustToken();
  const token = await prisma.trustAccessToken.create({
    data: {
      orgId: org.id,
      tokenHash: hash,
      tokenPrefix: prefix,
      label: "Acme DD",
      createdById: user.id,
    },
  });
  return { org, user, slug, attId, token };
}

function call(slug: string, id: string, cookie?: string) {
  const req = new NextRequest(
    `http://localhost/api/trust/${slug}/attestation/${id}`,
    cookie ? { headers: { cookie: `${TRUST_COOKIE_NAME}=${cookie}` } } : {},
  );
  return GET(req, { params: Promise.resolve({ slug, id }) });
}

beforeEach(() => {
  vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
  vi.spyOn(storage, "retrieve").mockResolvedValue(PDF);
});

describe("GET /api/trust/[slug]/attestation/[id]", () => {
  it("404s without a cookie", async () => {
    const { slug, attId } = await scenario();
    expect((await call(slug, attId)).status).toBe(404);
  });

  it("streams the PDF for a valid cookie and a listed attestation", async () => {
    const { slug, attId, token, org, user } = await scenario();
    await prisma.redteamAttestation.create({
      data: {
        id: attId,
        orgId: org.id,
        usecaseId: (
          await prisma.aiUsecase.create({
            data: {
              orgId: org.id,
              name: "Sys",
              ownerId: user.id,
              autonomyLevel: "assistant",
              deploymentType: "built",
            },
          })
        ).id,
        attesterName: "ToB",
        attesterOrg: "Trail of Bits",
        attesterContact: "x@example.com",
        scope: "full",
        methodology: "m",
        attestedAt: new Date(),
        storageKey: "fake/key.pdf",
        reportSha256: SHA,
        reportBytes: PDF.byteLength,
        summary: "s",
        createdBy: user.id,
      },
    });
    const cookie = signTrustCookie({ tokenId: token.id, slug });
    const res = await call(slug, attId, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("404s for an attestation not listed in the current snapshot", async () => {
    const { slug, token } = await scenario();
    const cookie = signTrustCookie({ tokenId: token.id, slug });
    expect((await call(slug, "att-not-listed", cookie)).status).toBe(404);
  });

  it("404s once the token is revoked", async () => {
    const { slug, attId, token } = await scenario();
    await prisma.trustAccessToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });
    const cookie = signTrustCookie({ tokenId: token.id, slug });
    expect((await call(slug, attId, cookie)).status).toBe(404);
  });

  it("404s when the stored bytes no longer match reportSha256", async () => {
    const { slug, attId, token, org, user } = await scenario();
    await prisma.redteamAttestation.create({
      data: {
        id: attId,
        orgId: org.id,
        usecaseId: (
          await prisma.aiUsecase.create({
            data: {
              orgId: org.id,
              name: "Sys",
              ownerId: user.id,
              autonomyLevel: "assistant",
              deploymentType: "built",
            },
          })
        ).id,
        attesterName: "ToB",
        attesterOrg: "Trail of Bits",
        attesterContact: "x@example.com",
        scope: "full",
        methodology: "m",
        attestedAt: new Date(),
        storageKey: "fake/key.pdf",
        reportSha256: SHA,
        reportBytes: PDF.byteLength,
        summary: "s",
        createdBy: user.id,
      },
    });
    vi.spyOn(storage, "retrieve").mockResolvedValue(Buffer.from("tampered"));
    const cookie = signTrustCookie({ tokenId: token.id, slug });
    expect((await call(slug, attId, cookie)).status).toBe(404);
  });
});
