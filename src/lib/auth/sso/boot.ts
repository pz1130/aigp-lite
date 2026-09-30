import { prisma } from "@/lib/db";
import { __setBootDisabled } from "./config";

type LogFn = (entry: {
  event: string;
  reason?: string;
  orgId?: string;
  issuer?: string;
}) => void;

const defaultLogger: LogFn = (entry) => {
  console.log("[sso]", entry);
};

export async function validateSsoBoot(
  logger: LogFn = defaultLogger,
): Promise<void> {
  const issuer = process.env.SSO_OIDC_ISSUER;
  const clientId = process.env.SSO_OIDC_CLIENT_ID;
  const clientSecret = process.env.SSO_OIDC_CLIENT_SECRET;
  const orgId = process.env.SSO_OIDC_ORG_ID;

  if (!issuer || !clientId || !clientSecret || !orgId) {
    __setBootDisabled(false);
    logger({ event: "sso_disabled", reason: "config_missing" });
    return;
  }

  try {
    new URL(issuer);
  } catch {
    __setBootDisabled(true);
    logger({ event: "sso_disabled", reason: "bad_issuer", issuer });
    return;
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    __setBootDisabled(true);
    logger({ event: "sso_disabled", reason: "org_missing", orgId });
    return;
  }

  __setBootDisabled(false);
  logger({ event: "sso_enabled", orgId, issuer });
}
