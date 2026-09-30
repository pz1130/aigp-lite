import {
  getActiveOrgId,
  getUserOrganizations,
  requireSession,
} from "@/lib/auth/session";
import { headers } from "next/headers";
import { MODULES } from "@/lib/modules/registry";
import { getLocale } from "next-intl/server";
import { locales } from "@/i18n/config";
import { CommandPaletteTrigger } from "./CommandPaletteTrigger";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { OrganizationSwitcher } from "./OrganizationSwitcher";

function stripLocalePrefix(pathname: string): string {
  for (const loc of locales) {
    if (pathname === `/${loc}`) return "/";
    if (pathname.startsWith(`/${loc}/`)) return pathname.slice(loc.length + 1);
  }
  return pathname;
}

export async function Topbar() {
  const ctx = await requireSession();
  const organizations = await getUserOrganizations(ctx.userId);
  const activeOrgId = (await getActiveOrgId()) ?? ctx.orgId;
  const locale = (await getLocale()) as "zh" | "en";
  const headersList = await headers();
  const rawPathname = headersList.get("x-pathname") ?? "/";
  const pathname = stripLocalePrefix(rawPathname);
  const currentModule = MODULES.find(
    (m) => pathname === `/${m.slug}` || pathname.startsWith(`/${m.slug}/`),
  );

  return (
    <header className="relative h-12 flex items-center gap-4 border-b border-border-default/50 px-5 shrink-0 z-10">
      {/* Glass blur */}
      <div className="pointer-events-none absolute inset-0 bg-surface/70 backdrop-blur-xl" />
      {/* Bottom gradient line */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

      {/* Content */}
      <CommandPaletteTrigger />

      {currentModule && (
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-secondary">
            {currentModule.title[locale]}
          </span>
        </div>
      )}

      <OrganizationSwitcher
        organizations={organizations}
        activeOrgId={activeOrgId}
      />

      <div className="flex-1" />

      <div className="relative flex items-center gap-0.5">
        <NotificationBell />
        <ThemeToggle />
        <UserMenu email={ctx.email} role={ctx.role} />
      </div>
    </header>
  );
}
