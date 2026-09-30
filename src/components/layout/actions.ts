"use server";
import { cookies } from "next/headers";
import { auth, signOut } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { ACTIVE_ORG_COOKIE_NAME, setActiveOrgCookie } from "@/lib/auth/session";

export async function switchOrganizationAction(orgId: string) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) throw new Error("UNAUTHENTICATED");

  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { orgId: true },
  });
  if (!membership) throw new Error("FORBIDDEN");

  await setActiveOrgCookie(membership.orgId);
}

export async function logoutAction() {
  (await cookies()).delete(ACTIVE_ORG_COOKIE_NAME);
  await signOut({ redirectTo: "/login" });
}
