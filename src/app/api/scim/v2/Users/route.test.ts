import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { upsertConnection } from "@/lib/scim/store";
import { GET, POST } from "./route";

async function makeOrgWithConnection(
  roleAttribute: string | null = null,
  roleValueMap: Record<string, string> | null = null,
) {
  const org = await prisma.organization.create({
    data: {
      name:
        "SCIM-USERS-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    },
  });
  const { rawToken } = await upsertConnection(
    org.id,
    { roleAttribute, roleValueMap },
    "tester",
  );
  return { org, rawToken: rawToken! };
}

function req(url: string, init: RequestInit) {
  return new Request(url, init);
}

describe("GET /api/scim/v2/Users", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await GET(req("http://localhost/api/scim/v2/Users", {}));
    expect(res.status).toBe(401);
  });

  it("rejects a request with an invalid bearer token", async () => {
    const res = await GET(
      req("http://localhost/api/scim/v2/Users", {
        headers: { authorization: "Bearer aigp_scim_wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("lists members of the org scoped to the token, as a SCIM ListResponse", async () => {
    const { org, rawToken } = await makeOrgWithConnection();
    const email = `list-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: "x" },
    });
    await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, role: "viewer" },
    });

    const res = await GET(
      req("http://localhost/api/scim/v2/Users", {
        headers: { authorization: `Bearer ${rawToken}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemas).toContain(
      "urn:ietf:params:scim:api:messages:2.0:ListResponse",
    );
    expect(body.Resources.some((r: { id: string }) => r.id === user.id)).toBe(
      true,
    );
  });

  it('filters by emails.value eq "..."', async () => {
    const { org, rawToken } = await makeOrgWithConnection();
    const emailA = `filter-a-${Date.now()}@example.com`;
    const emailB = `filter-b-${Date.now()}@example.com`;
    const userA = await prisma.user.create({
      data: { email: emailA, passwordHash: "x" },
    });
    const userB = await prisma.user.create({
      data: { email: emailB, passwordHash: "x" },
    });
    await prisma.membership.create({
      data: { orgId: org.id, userId: userA.id, role: "viewer" },
    });
    await prisma.membership.create({
      data: { orgId: org.id, userId: userB.id, role: "viewer" },
    });

    const url = `http://localhost/api/scim/v2/Users?filter=${encodeURIComponent(`emails.value eq "${emailA}"`)}`;
    const res = await GET(
      req(url, { headers: { authorization: `Bearer ${rawToken}` } }),
    );
    const body = await res.json();
    expect(body.totalResults).toBe(1);
    expect(body.Resources[0].id).toBe(userA.id);
  });

  it('filters by userName eq "..."', async () => {
    const { org, rawToken } = await makeOrgWithConnection();
    const email = `filter-username-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: "x" },
    });
    await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, role: "viewer" },
    });

    const url = `http://localhost/api/scim/v2/Users?filter=${encodeURIComponent(`userName eq "${email}"`)}`;
    const res = await GET(
      req(url, { headers: { authorization: `Bearer ${rawToken}` } }),
    );
    const body = await res.json();
    expect(body.totalResults).toBe(1);
    expect(body.Resources[0].id).toBe(user.id);
  });

  it("returns 400 for an unsupported/malformed filter expression", async () => {
    const { rawToken } = await makeOrgWithConnection();
    const url = `http://localhost/api/scim/v2/Users?filter=${encodeURIComponent(`department eq "eng"`)}`;
    const res = await GET(
      req(url, { headers: { authorization: `Bearer ${rawToken}` } }),
    );
    expect(res.status).toBe(400);
  });

  it("never returns another org's members, even when that org's user matches a filter", async () => {
    const { org: orgA, rawToken: tokenA } = await makeOrgWithConnection();
    const { org: orgB } = await makeOrgWithConnection();
    const emailA = `iso-a-${Date.now()}@example.com`;
    const emailB = `iso-b-${Date.now()}@example.com`;
    const userA = await prisma.user.create({
      data: { email: emailA, passwordHash: "x" },
    });
    const userB = await prisma.user.create({
      data: { email: emailB, passwordHash: "x" },
    });
    await prisma.membership.create({
      data: { orgId: orgA.id, userId: userA.id, role: "viewer" },
    });
    await prisma.membership.create({
      data: { orgId: orgB.id, userId: userB.id, role: "viewer" },
    });

    const res = await GET(
      req("http://localhost/api/scim/v2/Users", {
        headers: { authorization: `Bearer ${tokenA}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.Resources.some((r: { id: string }) => r.id === userA.id)).toBe(
      true,
    );
    expect(body.Resources.some((r: { id: string }) => r.id === userB.id)).toBe(
      false,
    );

    const filteredUrl = `http://localhost/api/scim/v2/Users?filter=${encodeURIComponent(`emails.value eq "${emailB}"`)}`;
    const filteredRes = await GET(
      req(filteredUrl, { headers: { authorization: `Bearer ${tokenA}` } }),
    );
    const filteredBody = await filteredRes.json();
    expect(filteredBody.totalResults).toBe(0);
  });
});

describe("POST /api/scim/v2/Users", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await POST(
      req("http://localhost/api/scim/v2/Users", {
        method: "POST",
        body: JSON.stringify({ emails: [{ value: "x@example.com" }] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("provisions a new member and returns a 201 SCIM User resource", async () => {
    const { rawToken } = await makeOrgWithConnection();
    const email = `create-${Date.now()}@example.com`;

    const res = await POST(
      req("http://localhost/api/scim/v2/Users", {
        method: "POST",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: email,
          emails: [{ value: email, primary: true }],
          active: true,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.userName).toBe(email);
    expect(body.active).toBe(true);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
  });

  it("resolves the configured role attribute on create", async () => {
    const { rawToken } = await makeOrgWithConnection("department", {
      eng: "admin",
    });
    const email = `create-role-${Date.now()}@example.com`;

    const res = await POST(
      req("http://localhost/api/scim/v2/Users", {
        method: "POST",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userName: email,
          emails: [{ value: email }],
          active: true,
          department: "eng",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email } });
    const m = await prisma.membership.findFirst({
      where: { userId: user!.id },
    });
    expect(m!.role).toBe("admin");
  });

  it("returns 400 when the payload has no email", async () => {
    const { rawToken } = await makeOrgWithConnection();
    const res = await POST(
      req("http://localhost/api/scim/v2/Users", {
        method: "POST",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ userName: "no-email" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 (not 500) when the request body is not valid JSON", async () => {
    const { rawToken } = await makeOrgWithConnection();
    const res = await POST(
      req("http://localhost/api/scim/v2/Users", {
        method: "POST",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: "not-json{{{",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.schemas).toContain(
      "urn:ietf:params:scim:api:messages:2.0:Error",
    );
    expect(body.status).toBe("400");
  });
});
