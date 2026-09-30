import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { provisionScimUser, type ScimUserInput } from "@/lib/scim/provision";
import {
  asScimObject,
  authenticateScimRequest,
  normalizeScimActive,
  readScimEmail,
  readScimName,
  scimUnauthorized,
  scimBadRequest,
  toScimUser,
  type ScimPayload,
} from "../_shared";

type ParsedFilter = { email: string } | { invalid: true } | null;

// Spec only supports a single `attr eq "value"` filter, on userName or emails.value
// (both resolve to the same email lookup — User has no separate userName field).
// Any other shape must 400 rather than silently returning the unfiltered list.
function parseFilter(filter: string | null): ParsedFilter {
  if (!filter) return null;
  const match = filter.match(
    /^\s*(userName|emails\.value)\s+eq\s+"([^"]*)"\s*$/i,
  );
  if (!match) return { invalid: true };
  return { email: match[2] };
}

export async function GET(request: Request) {
  const ctx = await authenticateScimRequest(request);
  if (!ctx) return scimUnauthorized();

  const url = new URL(request.url);
  const parsed = parseFilter(url.searchParams.get("filter"));
  if (parsed && "invalid" in parsed) {
    return scimBadRequest(
      'unsupported filter expression; only a single attr eq "value" filter on userName or emails.value is supported',
    );
  }

  const memberships = await prisma.membership.findMany({
    where: {
      orgId: ctx.orgId,
      ...(parsed ? { user: { email: parsed.email } } : {}),
    },
    include: { user: { select: { email: true, name: true } } },
  });

  const resources = memberships.map((m) => toScimUser(m));
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: resources.length,
    startIndex: 1,
    itemsPerPage: resources.length,
    Resources: resources,
  });
}

export async function POST(request: Request) {
  const ctx = await authenticateScimRequest(request);
  if (!ctx) return scimUnauthorized();

  let payload: ScimPayload;
  try {
    payload = asScimObject(await request.json());
  } catch {
    return scimBadRequest("Request body is not valid JSON");
  }
  // Preserve the existing POST contract: provisioning requires the SCIM
  // emails attribute. PUT accepts userName as an interoperability fallback.
  const email = readScimEmail(payload, false);
  if (!email) {
    return NextResponse.json(
      {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "emails[0].value is required",
        status: "400",
      },
      { status: 400 },
    );
  }

  const active =
    payload.active === undefined ? true : normalizeScimActive(payload.active);
  if (active === undefined) {
    return scimBadRequest('active must be a boolean or "true"/"false"');
  }

  const input: ScimUserInput = {
    email,
    name: readScimName(payload),
    active,
    raw: payload,
  };

  const result = await provisionScimUser(input, {
    orgId: ctx.orgId,
    roleAttribute: ctx.roleAttribute,
    roleValueMap: ctx.roleValueMap,
  });

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { email: true, name: true },
  });
  return NextResponse.json(
    toScimUser({ userId: result.userId, role: "", user: user! }, input.active),
    { status: 201 },
  );
}
