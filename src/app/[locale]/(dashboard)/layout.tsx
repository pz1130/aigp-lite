import type { ReactNode } from "react";
import { redirect } from "@/i18n/routing";
import {
  getActiveOrgId,
  getSessionContext,
  getUserOrganizations,
} from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { QuickActionProvider } from "@/components/layout/QuickActionContext";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const ctx = await getSessionContext();
  if (!ctx) {
    redirect({ href: "/login", locale: locale as "zh" | "en" });
    return null;
  }
  const organizations = await getUserOrganizations(ctx.userId);
  const activeOrgId = await getActiveOrgId();
  if (
    organizations.length > 1 &&
    (!activeOrgId || !organizations.some((org) => org.id === activeOrgId))
  ) {
    redirect({ href: "/select-org", locale: locale as "zh" | "en" });
  }

  return (
    <QuickActionProvider>
      {/* Subtle radial gradient background for depth */}
      <div className="relative flex h-screen flex-col bg-app">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(50,168,82,0.05),transparent)] bg-grid-dots" />
        <Topbar />
        <div className="relative flex flex-1 overflow-hidden">
          <Sidebar />
          <main id="main-content" className="flex-1 overflow-y-auto px-8 py-7">
            {children}
          </main>
        </div>
      </div>
    </QuickActionProvider>
  );
}
