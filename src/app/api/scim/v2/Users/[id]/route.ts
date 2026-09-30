import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { provisionScimUser, deprovisionScimUser } from "@/lib/scim/provision";
import {
  authenticateScimRequest,
  scimUnauthorized,
  scimBadRequest,
  toScimUser,
  asScimObject,
  normalizeScimActive,
  readScimEmail,
  readScimName,
  type ScimPayload,
} from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

function scimNotFound() {
  return NextResponse.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "user not found",
      status: "404",
    },
    { status: 404 },
  );
}

async function findMember(orgId: string, userId: string) {
  return prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: { user: { select: { email: true, name: true } } },
  });
}

export async function GET(request: Request, { params }: RouteContext) {
  const ctx = await authenticateScimRequest(request);
  if (!ctx) return scimUnauthorized();
  const { id } = await params;

  const member = await findMember(ctx.orgId, id);
  if (!member) return scimNotFound();
  return NextResponse.json(toScimUser(member));
}

export async function PUT(request: Request, { params }: RouteContext) {
  const ctx = await authenticateScimRequest(request);
  if (!ctx) return scimUnauthorized();
  const { id } = await params;

  // Org-scoped existence check up front: a URL id with no Membership in this
  // org must 404 for every verb (spec Error Handling section), never fall
  // through to a global user lookup that could touch another org's data.
  const member = await findMember(ctx.orgId, id);
  if (!member) return scimNotFound();

  let payload: ScimPayload;
  try {
    payload = asScimObject(await request.json());
  } catch {
    return scimBadRequest("Request body is not valid JSON");
  }
  const active =
    payload.active === undefined ? true : normalizeScimActive(payload.active);
  if (active === undefined) {
    return scimBadRequest('active must be a boolean or "true"/"false"');
  }

  if (!active) {
    await deprovisionScimUser(id, ctx.orgId);
    return NextResponse.json(toScimUser(member, false));
  }

  const email = readScimEmail(payload);
  if (!email) {
    return NextResponse.json(
      {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "userName or emails[0].value is required",
        status: "400",
      },
      { status: 400 },
    );
  }
  const result = await provisionScimUser(
    {
      email,
      name: readScimName(payload),
      active: true,
      raw: payload,
    },
    {
      orgId: ctx.orgId,
      roleAttribute: ctx.roleAttribute,
      roleValueMap: ctx.roleValueMap,
    },
  );
  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { email: true, name: true },
  });
  return NextResponse.json(
    toScimUser({ userId: result.userId, role: "", user: user! }, true),
  );
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const ctx = await authenticateScimRequest(request);
  if (!ctx) return scimUnauthorized();
  const { id } = await params;

  // Same org-scoped existence check as PUT/GET: a URL id with no Membership
  // in this org 404s before any provisioning action is considered. This
  // schema has no soft-delete/inactive flag on Membership - deactivation
  // hard-deletes the row - so an id with no current membership has no
  // resource to reactivate; a fresh POST is the only path back in, not PATCH.
  const member = await findMember(ctx.orgId, id);
  if (!member) return scimNotFound();

  let payload: ScimPayload;
  try {
    payload = asScimObject(await request.json());
  } catch {
    return scimBadRequest("Request body is not valid JSON");
  }
  const operations = payload.Operations;

  if (!Array.isArray(operations) || operations.length === 0) {
    return scimBadRequest("Operations must be a non-empty array");
  }

  // Only "replace active" is supported in this MVP; any other op falls
  // through to the 400 below rather than silently no-op'ing (spec: malformed
  // PATCH Operations array must 400, not report false success).
  let active: boolean | undefined;
  for (const rawOperation of operations) {
    const operation = asScimObject(rawOperation);
    const value = asScimObject(operation.value);
    if (operation.op === "replace" && "active" in value) {
      const normalized = normalizeScimActive(value.active);
      if (normalized === undefined) {
        return scimBadRequest(
          'Operations[].value.active must be a boolean or "true"/"false"',
        );
      }
      active = normalized;
    }
  }

  if (active === undefined) {
    return scimBadRequest(
      "no supported Operations entry found (only replace active is supported)",
    );
  }

  if (active === false) {
    await deprovisionScimUser(id, ctx.orgId);
    return NextResponse.json(toScimUser(member, false));
  }

  // Membership already exists in this org (checked above), and existence
  // implies active in this schema - no provisioning call needed to confirm
  // a no-op reactivation.
  return NextResponse.json(toScimUser(member, true));
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const ctx = await authenticateScimRequest(request);
  if (!ctx) return scimUnauthorized();
  const { id } = await params;

  const member = await findMember(ctx.orgId, id);
  if (!member) return scimNotFound();

  await deprovisionScimUser(id, ctx.orgId);
  return new NextResponse(null, { status: 204 });
}
