import { auth } from "./auth";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/rbac/roles";
import type { SessionContext } from "./types";
import { cookies } from "next/headers";

export const ACTIVE_ORG_COOKIE_NAME = "aigp_active_org";
const ACTIVE_ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export interface UserOrganization {
  id: string;
  name: string;
  role: Role;
}

export type { SessionContext };

export async function getUserOrganizations(
  userId: string,
): Promise<UserOrganization[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: {
      role: true,
      joinedAt: true,
      org: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((membership) => ({
    id: membership.org.id,
    name: membership.org.name,
    role: membership.role as Role,
  }));
}

export async function getActiveOrgId(): Promise<string | null> {
  return (await cookies()).get(ACTIVE_ORG_COOKIE_NAME)?.value ?? null;
}

export async function setActiveOrgCookie(orgId: string): Promise<void> {
  (await cookies()).set(ACTIVE_ORG_COOKIE_NAME, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
  });
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const email = session?.user?.email;
  if (!userId || !email) return null;

  const activeOrgId = await getActiveOrgId();
  let m = activeOrgId
    ? await prisma.membership.findFirst({
        where: { userId, orgId: activeOrgId },
        orderBy: { joinedAt: "asc" },
      })
    : null;
  if (!m) {
    m = await prisma.membership.findFirst({
      where: { userId },
      orderBy: { joinedAt: "asc" },
    });
  }
  if (!m) return null;
  return { userId, email, orgId: m.orgId, role: m.role as Role };
}

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new Error("UNAUTHENTICATED");
  return ctx;
}
