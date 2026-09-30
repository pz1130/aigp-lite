import { Prisma } from "@/lib/prisma";
import { prisma } from "@/lib/db";
import { generateScimToken } from "./token";
import type { RoleValueMap } from "./config";

export type ScimConnectionInput = {
  roleAttribute?: string | null;
  roleValueMap?: RoleValueMap | null;
  enabled?: boolean;
};

export type RedactedScimConnection = {
  orgId: string;
  tokenPrefix: string;
  roleAttribute: string | null;
  roleValueMap: RoleValueMap | null;
  enabled: boolean;
  updatedAt: Date;
};

/**
 * Create or update an org's SCIM connection config (role mapping / enabled).
 * Does NOT rotate the token on update — creating for the first time also
 * mints one and returns the raw value (shown once); updates never return it.
 */
export async function upsertConnection(
  orgId: string,
  input: ScimConnectionInput,
  createdBy: string,
): Promise<{ rawToken: string | null }> {
  const existing = await prisma.scimConnection.findUnique({ where: { orgId } });
  const roleAttribute = input.roleAttribute?.trim() || null;
  const enabled = input.enabled ?? true;

  // input.roleValueMap === undefined -> field omitted from the request; leave
  // it out of `data` entirely so update() preserves the existing value
  // (Prisma silently ignores undefined-valued keys) and create() just leaves
  // the column at its default.
  // input.roleValueMap === null -> field explicitly cleared by the admin UI;
  // a Json? column needs the Prisma.DbNull sentinel to actually persist SQL
  // NULL (passing a plain JS null is ambiguous/rejected by Prisma's JSON
  // handling).
  // otherwise -> pass the object through as-is.
  const roleValueMapField =
    input.roleValueMap === undefined
      ? {}
      : {
          roleValueMap:
            input.roleValueMap === null ? Prisma.DbNull : input.roleValueMap,
        };

  if (existing) {
    await prisma.scimConnection.update({
      where: { orgId },
      data: { roleAttribute, enabled, ...roleValueMapField },
    });
    return { rawToken: null };
  }

  const { raw, hash, prefix } = generateScimToken();
  await prisma.scimConnection.create({
    data: {
      orgId,
      tokenHash: hash,
      tokenPrefix: prefix,
      roleAttribute,
      enabled,
      createdBy,
      ...roleValueMapField,
    },
  });
  return { rawToken: raw };
}

/** Rotate the bearer token, leaving every other field untouched. Returns the new raw value (shown once). */
export async function rotateToken(orgId: string): Promise<string> {
  const { raw, hash, prefix } = generateScimToken();
  await prisma.scimConnection.update({
    where: { orgId },
    data: { tokenHash: hash, tokenPrefix: prefix },
  });
  return raw;
}

/** Toggle a connection on or off without deleting it. */
export async function setEnabled(
  orgId: string,
  enabled: boolean,
): Promise<void> {
  await prisma.scimConnection.update({ where: { orgId }, data: { enabled } });
}

/** Redacted read for the admin UI — never includes the token. */
export async function getRedacted(
  orgId: string,
): Promise<RedactedScimConnection | null> {
  const c = await prisma.scimConnection.findUnique({ where: { orgId } });
  if (!c) return null;
  return {
    orgId: c.orgId,
    tokenPrefix: c.tokenPrefix,
    roleAttribute: c.roleAttribute,
    roleValueMap: (c.roleValueMap as RoleValueMap | null) ?? null,
    enabled: c.enabled,
    updatedAt: c.updatedAt,
  };
}
