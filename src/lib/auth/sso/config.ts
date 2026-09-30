export type Role = "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer";

export const VALID_ROLES: readonly Role[] = [
  "admin",
  "risk_officer",
  "ai_owner",
  "auditor",
  "viewer",
];

/**
 * IdP groups-claim → role mapping. Outer key is the claim name (e.g. "groups"),
 * inner maps a claim value (e.g. "platform-admins") to one of the app roles.
 * Example: `{ "groups": { "platform-admins": "admin" } }`.
 */
export type GroupRoleMap = Record<string, Record<string, string>>;

export type SsoConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  orgId: string;
  buttonLabel: string;
  allowedDomains: string[] | null;
  /** Only carried by DB-backed connections; env config omits it. */
  groupRoleMap?: GroupRoleMap | null;
};

/**
 * Resolve a role from an OIDC profile's group claims using a GroupRoleMap.
 * Returns the first matching, valid role, or null when nothing maps. A claim
 * value may be a string or array of strings. Unknown roles are ignored.
 */
export function resolveRoleFromGroups(
  groupRoleMap: GroupRoleMap | null | undefined,
  claims: Record<string, unknown>,
): Role | null {
  if (!groupRoleMap) return null;
  for (const [claimName, valueMap] of Object.entries(groupRoleMap)) {
    const raw = claims[claimName];
    const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    for (const v of values) {
      const role = valueMap[String(v)];
      if (role && (VALID_ROLES as readonly string[]).includes(role)) {
        return role as Role;
      }
    }
  }
  return null;
}

let bootDisabled = false;

/** Forced off by boot validation. Internal. */
export function __setBootDisabled(value: boolean): void {
  bootDisabled = value;
}

/** Test helper only. */
export function __resetBootFlagForTests(): void {
  bootDisabled = false;
}

function envPresent(): boolean {
  return Boolean(
    process.env.SSO_OIDC_ISSUER &&
    process.env.SSO_OIDC_CLIENT_ID &&
    process.env.SSO_OIDC_CLIENT_SECRET &&
    process.env.SSO_OIDC_ORG_ID,
  );
}

export function isSsoEnabled(): boolean {
  if (bootDisabled) return false;
  return envPresent();
}

export function getSsoConfig(): SsoConfig {
  if (!isSsoEnabled()) {
    throw new Error(
      "SSO is not configured: set SSO_OIDC_ISSUER, SSO_OIDC_CLIENT_ID, SSO_OIDC_CLIENT_SECRET, SSO_OIDC_ORG_ID",
    );
  }
  return {
    issuer: process.env.SSO_OIDC_ISSUER!,
    clientId: process.env.SSO_OIDC_CLIENT_ID!,
    clientSecret: process.env.SSO_OIDC_CLIENT_SECRET!,
    orgId: process.env.SSO_OIDC_ORG_ID!,
    buttonLabel:
      process.env.SSO_OIDC_BUTTON_LABEL?.trim() || "Sign in with SSO",
    allowedDomains: parseAllowedDomains(process.env.SSO_OIDC_ALLOWED_DOMAINS),
  };
}

export function parseAllowedDomains(raw: string | undefined): string[] | null {
  if (!raw || !raw.trim()) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return list.length === 0 ? null : list;
}

export function isEmailAllowed(
  email: string,
  allowed: string[] | null,
): boolean {
  if (allowed === null) return true;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return allowed.includes(domain);
}
