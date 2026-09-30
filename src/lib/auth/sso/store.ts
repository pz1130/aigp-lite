import { prisma } from "@/lib/db";
import { encryptJson, decryptJson } from "@/lib/crypto/secrets";
import {
  getSsoConfig,
  isSsoEnabled,
  type SsoConfig,
  type GroupRoleMap,
} from "./config";

export type SsoConnectionInput = {
  issuer: string;
  clientId: string;
  /** Required to create; omit on update to preserve the stored secret. */
  clientSecret?: string | null;
  buttonLabel?: string | null;
  allowedDomains?: string[];
  groupRoleMap?: GroupRoleMap | null;
  enabled?: boolean;
};

/** Server-safe view of a connection: everything except the secret. */
export type RedactedSsoConnection = {
  orgId: string;
  issuer: string;
  clientId: string;
  buttonLabel: string | null;
  allowedDomains: string[];
  groupRoleMap: GroupRoleMap | null;
  enabled: boolean;
  hasSecret: boolean;
  updatedAt: Date;
};

/**
 * Create or replace an org's SSO connection (one IdP per org for v1). The client
 * secret is encrypted at rest with the same AES-256-GCM envelope as
 * ProviderConnection; plaintext never touches the DB.
 */
export async function upsertConnection(
  orgId: string,
  input: SsoConnectionInput,
  createdBy?: string,
): Promise<void> {
  const existing = await prisma.ssoConnection.findUnique({ where: { orgId } });
  if (!input.clientSecret && !existing) {
    throw new Error("client secret is required to create a new SSO connection");
  }
  // Omitting the secret on an update preserves the stored ciphertext.
  const clientSecretEncrypted = input.clientSecret
    ? new Uint8Array(encryptJson(input.clientSecret))
    : undefined;
  const buttonLabel = input.buttonLabel?.trim() || null;
  const allowedDomains = (input.allowedDomains ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
  const groupRoleMap = (input.groupRoleMap ?? undefined) as object | undefined;
  const enabled = input.enabled ?? true;

  // Branch explicitly: a Prisma upsert validates the `create` payload even when
  // the row exists, which would reject an update that omits the secret.
  if (existing) {
    await prisma.ssoConnection.update({
      where: { orgId },
      data: {
        issuer: input.issuer,
        clientId: input.clientId,
        ...(clientSecretEncrypted ? { clientSecretEncrypted } : {}),
        buttonLabel,
        allowedDomains,
        groupRoleMap,
        enabled,
      },
    });
  } else {
    await prisma.ssoConnection.create({
      data: {
        orgId,
        issuer: input.issuer,
        clientId: input.clientId,
        clientSecretEncrypted: clientSecretEncrypted!,
        buttonLabel,
        allowedDomains,
        groupRoleMap,
        enabled,
        createdBy,
      },
    });
  }
}

/** Rotate just the client secret, leaving every other field untouched. */
export async function rotateSecret(
  orgId: string,
  clientSecret: string,
): Promise<void> {
  await prisma.ssoConnection.update({
    where: { orgId },
    data: { clientSecretEncrypted: new Uint8Array(encryptJson(clientSecret)) },
  });
}

/** Toggle a connection on or off without deleting it. */
export async function setEnabled(
  orgId: string,
  enabled: boolean,
): Promise<void> {
  await prisma.ssoConnection.update({ where: { orgId }, data: { enabled } });
}

/** Redacted read for the admin UI — never includes the secret. */
export async function getRedacted(
  orgId: string,
): Promise<RedactedSsoConnection | null> {
  const c = await prisma.ssoConnection.findUnique({ where: { orgId } });
  if (!c) return null;
  return {
    orgId: c.orgId,
    issuer: c.issuer,
    clientId: c.clientId,
    buttonLabel: c.buttonLabel,
    allowedDomains: c.allowedDomains,
    groupRoleMap: (c.groupRoleMap as GroupRoleMap | null) ?? null,
    enabled: c.enabled,
    hasSecret: Buffer.from(c.clientSecretEncrypted).length > 0,
    updatedAt: c.updatedAt,
  };
}

/** Decrypt a stored row into a runtime SsoConfig (secret decrypted here on the server). */
type SsoConnectionRow = {
  orgId: string;
  issuer: string;
  clientId: string;
  clientSecretEncrypted: Uint8Array;
  buttonLabel: string | null;
  allowedDomains: string[];
  groupRoleMap: unknown;
};

function rowToSsoConfig(c: SsoConnectionRow): SsoConfig {
  return {
    issuer: c.issuer,
    clientId: c.clientId,
    clientSecret: decryptJson<string>(Buffer.from(c.clientSecretEncrypted)),
    orgId: c.orgId,
    buttonLabel: c.buttonLabel?.trim() || "Sign in with SSO",
    // Empty allow-list means "no restriction" (matches env null semantics).
    allowedDomains: c.allowedDomains.length > 0 ? c.allowedDomains : null,
    groupRoleMap: (c.groupRoleMap as GroupRoleMap | null) ?? null,
  };
}

/**
 * Resolve the effective SSO config for a login attempt: prefer an enabled
 * DB-backed connection matching the org hint, otherwise fall back to the env
 * config (single-tenant bootstrap), otherwise null. The DB path decrypts the
 * secret here on the server.
 */
export async function resolveSsoConfig(
  orgHint?: string | null,
): Promise<SsoConfig | null> {
  if (orgHint) {
    const c = await prisma.ssoConnection.findUnique({
      where: { orgId: orgHint },
    });
    if (c && c.enabled) return rowToSsoConfig(c);
  }
  if (isSsoEnabled()) return getSsoConfig();
  return null;
}

/**
 * Request-independent provider config for build/registration time, where no org
 * hint is available (e.g. the OIDC callback). Prefers the env bootstrap config;
 * otherwise, for a single-tenant DB deployment, uses the sole enabled connection.
 * Returns null when SSO is unconfigured or ambiguous (multiple enabled connections).
 */
export async function resolveProviderConfig(): Promise<SsoConfig | null> {
  if (isSsoEnabled()) return getSsoConfig();
  const enabled = await prisma.ssoConnection.findMany({
    where: { enabled: true },
    take: 2,
  });
  if (enabled.length === 1) return rowToSsoConfig(enabled[0]);
  return null;
}

/**
 * Whether an SSO login can be initiated. With an org hint, checks that specific
 * connection (or env fallback); without one, checks the provider config (env or
 * a sole DB connection). Lets the login UI surface the SSO button for DB-only
 * deployments that set no env vars.
 */
export async function isSsoAvailable(
  orgHint?: string | null,
): Promise<boolean> {
  if (orgHint) return (await resolveSsoConfig(orgHint)) !== null;
  return (await resolveProviderConfig()) !== null;
}
