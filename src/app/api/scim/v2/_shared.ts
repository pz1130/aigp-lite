import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyScimToken } from "@/lib/scim/token";
import type { RoleValueMap } from "@/lib/scim/config";

export type ScimAuthContext = {
  orgId: string;
  roleAttribute: string | null;
  roleValueMap: RoleValueMap | null;
};

export type ScimPayload = Record<string, unknown>;

export function asScimObject(value: unknown): ScimPayload {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ScimPayload)
    : {};
}

export function normalizeScimActive(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return undefined;
}

export function readScimEmail(
  payload: ScimPayload,
  includeUserName = true,
): string | undefined {
  if (
    includeUserName &&
    typeof payload.userName === "string" &&
    payload.userName.trim()
  ) {
    return payload.userName;
  }
  if (!Array.isArray(payload.emails)) return undefined;
  const firstEmail = asScimObject(payload.emails[0]);
  return typeof firstEmail.value === "string" && firstEmail.value.trim()
    ? firstEmail.value
    : undefined;
}

export function readScimName(payload: ScimPayload): string | null {
  const name = asScimObject(payload.name);
  return typeof name.formatted === "string" ? name.formatted : null;
}

/** Verify the bearer token and load the connection's role-mapping config. Returns null on any auth failure. */
export async function authenticateScimRequest(
  request: Request,
): Promise<ScimAuthContext | null> {
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!bearer) return null;
  const verified = await verifyScimToken(bearer);
  if (!verified) return null;
  const connection = await prisma.scimConnection.findUnique({
    where: { id: verified.connectionId },
  });
  if (!connection) return null;
  return {
    orgId: verified.orgId,
    roleAttribute: connection.roleAttribute,
    roleValueMap: (connection.roleValueMap as RoleValueMap | null) ?? null,
  };
}

export function scimUnauthorized() {
  return NextResponse.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "invalid or missing bearer token",
      status: "401",
    },
    { status: 401 },
  );
}

/** Shared 400 shape for malformed filters / PATCH Operations arrays (spec Error Handling section). */
export function scimBadRequest(detail: string) {
  return NextResponse.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail,
      status: "400",
    },
    { status: 400 },
  );
}

type MembershipRow = {
  userId: string;
  role: string;
  user: { email: string; name: string | null };
};

/** Serialize a Membership+User row into a SCIM 2.0 User resource. */
export function toScimUser(m: MembershipRow, active = true) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: m.userId,
    userName: m.user.email,
    name: m.user.name ? { formatted: m.user.name } : undefined,
    emails: [{ value: m.user.email, primary: true }],
    active,
  };
}
