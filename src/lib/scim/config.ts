export type Role = "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer";
const VALID_ROLES: readonly Role[] = [
  "admin",
  "risk_officer",
  "ai_owner",
  "auditor",
  "viewer",
];

/** value(s) of the mapped SCIM attribute -> app role, e.g. { "engineering-admins": "admin" } */
export type RoleValueMap = Record<string, string>;

/**
 * Resolve a role from a raw SCIM user payload using a single custom attribute
 * (dot-path into the payload) mapped through roleValueMap. Falls back to
 * "viewer" when no roleAttribute is configured or nothing matches.
 */
export function resolveRoleFromScimAttribute(
  scimUser: Record<string, unknown>,
  roleAttribute: string | null | undefined,
  roleValueMap: RoleValueMap | null | undefined,
): Role {
  if (!roleAttribute || !roleValueMap) return "viewer";
  const raw = getByPath(scimUser, roleAttribute);
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  for (const v of values) {
    const role = roleValueMap[String(v)];
    if (role && (VALID_ROLES as readonly string[]).includes(role)) {
      return role as Role;
    }
  }
  return "viewer";
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
