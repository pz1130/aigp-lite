import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { upsertConnection } from "@/lib/scim/store";
import { GET, PUT, PATCH, DELETE } from "./route";

async function makeOrgWithMember() {
  const org = await prisma.organization.create({
    data: {
      name:
        "SCIM-USER-ID-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2),
    },
  });
  const { rawToken } = await upsertConnection(org.id, {}, "tester");
  const email = `member-${Date.now()}@example.com`;
  const user = await prisma.user.create({ data: { email, passwordHash: "x" } });
  await prisma.membership.create({
    data: { orgId: org.id, userId: user.id, role: "viewer" },
  });
  return { org, rawToken: rawToken!, user };
}

function req(url: string, init: RequestInit = {}) {
  return new Request(url, init);
}

function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeSecondOrgMember() {
  const org = await prisma.organization.create({
    data: {
      name:
        "SCIM-USER-ID-OTHER-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2),
    },
  });
  const email = `other-org-member-${Date.now()}@example.com`;
  const user = await prisma.user.create({ data: { email, passwordHash: "x" } });
  await prisma.membership.create({
    data: { orgId: org.id, userId: user.id, role: "viewer" },
  });
  return { org, user };
}

describe("GET /api/scim/v2/Users/[id]", () => {
  it("returns 401 with no bearer token", async () => {
    const { user } = await makeOrgWithMember();
    const res = await GET(
      req("http://localhost/api/scim/v2/Users/" + user.id),
      ctxFor(user.id),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the id has no membership in this org", async () => {
    const { rawToken } = await makeOrgWithMember();
    const res = await GET(
      req("http://localhost/api/scim/v2/Users/nonexistent", {
        headers: { authorization: `Bearer ${rawToken}` },
      }),
      ctxFor("nonexistent"),
    );
    expect(res.status).toBe(404);
  });

  it("returns the SCIM User resource for a member of this org", async () => {
    const { rawToken, user } = await makeOrgWithMember();
    const res = await GET(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        headers: { authorization: `Bearer ${rawToken}` },
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(user.id);
    expect(body.userName).toBe(user.email);
  });

  it("returns 404 for a real user id belonging only to a different org (never leaks cross-org data)", async () => {
    const { rawToken } = await makeOrgWithMember();
    const { user: otherOrgUser } = await makeSecondOrgMember();
    const res = await GET(
      req("http://localhost/api/scim/v2/Users/" + otherOrgUser.id, {
        headers: { authorization: `Bearer ${rawToken}` },
      }),
      ctxFor(otherOrgUser.id),
    );
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/scim/v2/Users/[id]", () => {
  it("deprovisions the membership when active is set to false", async () => {
    const { org, rawToken, user } = await makeOrgWithMember();
    const res = await PUT(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userName: user.email,
          emails: [{ value: user.email }],
          active: false,
        }),
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(200);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    });
    expect(m).toBeNull();
  });

  it('deprovisions the membership when active is the Azure AD string "False"', async () => {
    const { org, rawToken, user } = await makeOrgWithMember();
    const res = await PUT(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userName: user.email,
          active: "False",
        }),
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(200);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    });
    expect(m).toBeNull();
  });

  it("returns 404 and does not touch the other org's membership for a real user id belonging only to a different org", async () => {
    const { rawToken } = await makeOrgWithMember();
    const { org: otherOrg, user: otherOrgUser } = await makeSecondOrgMember();
    const res = await PUT(
      req("http://localhost/api/scim/v2/Users/" + otherOrgUser.id, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userName: otherOrgUser.email,
          emails: [{ value: otherOrgUser.email }],
          active: false,
        }),
      }),
      ctxFor(otherOrgUser.id),
    );
    expect(res.status).toBe(404);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: otherOrg.id, userId: otherOrgUser.id } },
    });
    expect(m).not.toBeNull();
  });

  it("returns 400 (not 500) when the request body is not valid JSON", async () => {
    const { rawToken, user } = await makeOrgWithMember();
    const res = await PUT(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: "not-json{{{",
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.schemas).toContain(
      "urn:ietf:params:scim:api:messages:2.0:Error",
    );
    expect(body.status).toBe("400");
  });
});

describe("PATCH /api/scim/v2/Users/[id]", () => {
  it("deprovisions on a replace-active-false Operations entry", async () => {
    const { org, rawToken, user } = await makeOrgWithMember();
    const res = await PATCH(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", value: { active: false } }],
        }),
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(200);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    });
    expect(m).toBeNull();
  });

  it("is a no-op 200 on a replace-active-true Operations entry for a current member", async () => {
    const { org, rawToken, user } = await makeOrgWithMember();
    const res = await PATCH(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          Operations: [{ op: "replace", value: { active: true } }],
        }),
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(true);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    });
    expect(m).not.toBeNull();
  });

  // Deactivation hard-deletes the Membership row (no soft-delete flag in this
  // schema), so a fully-removed membership has no resource left to reactivate
  // via PATCH-by-id; per the design spec's Error Handling section, any
  // GET/PATCH/PUT/DELETE against an id with no matching Membership in this
  // org must 404, not silently re-provision.
  it("returns 404 rather than re-provisioning when reactivating an id with no current membership in this org", async () => {
    const { org, rawToken, user } = await makeOrgWithMember();
    await prisma.membership.delete({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    });

    const res = await PATCH(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          Operations: [{ op: "replace", value: { active: true } }],
        }),
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(404);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    });
    expect(m).toBeNull();
  });

  it('deprovisions on a string-valued active:"False" (Azure AD shape)', async () => {
    const { org, rawToken, user } = await makeOrgWithMember();
    const res = await PATCH(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          Operations: [{ op: "replace", value: { active: "False" } }],
        }),
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(200);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    });
    expect(m).toBeNull();
  });

  it("returns 400 when Operations is missing", async () => {
    const { rawToken, user } = await makeOrgWithMember();
    const res = await PATCH(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when no Operations entry is a recognized replace-active op", async () => {
    const { rawToken, user } = await makeOrgWithMember();
    const res = await PATCH(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          Operations: [{ op: "remove", path: "emails" }],
        }),
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 and does not touch the other org's membership when the id belongs only to a different org", async () => {
    const { rawToken } = await makeOrgWithMember();
    const { org: otherOrg, user: otherOrgUser } = await makeSecondOrgMember();
    const res = await PATCH(
      req("http://localhost/api/scim/v2/Users/" + otherOrgUser.id, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          Operations: [{ op: "replace", value: { active: false } }],
        }),
      }),
      ctxFor(otherOrgUser.id),
    );
    expect(res.status).toBe(404);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: otherOrg.id, userId: otherOrgUser.id } },
    });
    expect(m).not.toBeNull();
  });

  it("returns 400 (not 500) when the request body is not valid JSON", async () => {
    const { rawToken, user } = await makeOrgWithMember();
    const res = await PATCH(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${rawToken}`,
          "content-type": "application/json",
        },
        body: "not-json{{{",
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.schemas).toContain(
      "urn:ietf:params:scim:api:messages:2.0:Error",
    );
    expect(body.status).toBe("400");
  });
});

describe("DELETE /api/scim/v2/Users/[id]", () => {
  it("removes the membership and returns 204", async () => {
    const { org, rawToken, user } = await makeOrgWithMember();
    const res = await DELETE(
      req("http://localhost/api/scim/v2/Users/" + user.id, {
        method: "DELETE",
        headers: { authorization: `Bearer ${rawToken}` },
      }),
      ctxFor(user.id),
    );
    expect(res.status).toBe(204);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
    });
    expect(m).toBeNull();
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u).not.toBeNull();
  });

  it("returns 404 and does not touch the other org's membership when the id belongs only to a different org", async () => {
    const { rawToken } = await makeOrgWithMember();
    const { org: otherOrg, user: otherOrgUser } = await makeSecondOrgMember();
    const res = await DELETE(
      req("http://localhost/api/scim/v2/Users/" + otherOrgUser.id, {
        method: "DELETE",
        headers: { authorization: `Bearer ${rawToken}` },
      }),
      ctxFor(otherOrgUser.id),
    );
    expect(res.status).toBe(404);
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: otherOrg.id, userId: otherOrgUser.id } },
    });
    expect(m).not.toBeNull();
  });
});
