import { getTranslations, getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { LayoutDashboard, Shield } from "lucide-react";
import { MODULES } from "@/lib/modules/registry";
import { Icon } from "@/components/ui/icon";
import { locales } from "@/i18n/config";
import { Brand } from "./Brand";
import { BadgeFor } from "./SidebarBadges";
import packageJson from "../../../package.json";

const GROUP_ORDER = ["govern", "operate", "connect", "insight"] as const;

function stripLocalePrefix(pathname: string): string {
  for (const loc of locales) {
    if (pathname === `/${loc}`) return "/";
    if (pathname.startsWith(`/${loc}/`)) return pathname.slice(loc.length + 1);
  }
  return pathname;
}

export async function Sidebar() {
  const t = await getTranslations("nav");
  const locale = (await getLocale()) as "zh" | "en";
  const headersList = await headers();
  const rawPathname = headersList.get("x-pathname") ?? "/";
  const pathname = stripLocalePrefix(rawPathname);
  const enabled = MODULES;

  let animIdx = 0;
  const nextDelay = () => `${animIdx++ * 0.025}s`;

  return (
    <aside className="relative w-[224px] shrink-0 border-r border-border-default/50 bg-app/80 flex flex-col select-none">
      {/* Subtle left gradient */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-accent/20 to-transparent" />

      {/* Brand */}
      <Brand />
      <div className="mx-4 h-px bg-border-default/40 mb-1" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-4 space-y-4">
        <a
          href="/"
          className={`group flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium transition-all duration-150 animate-fade-in-up ${
            pathname === "/"
              ? "bg-accent/12 text-accent shadow-sm shadow-[rgba(50,168,82,0.15)]"
              : "text-secondary/80 hover:text-primary hover:bg-muted/60"
          }`}
          style={{ animationDelay: nextDelay() }}
        >
          <LayoutDashboard size={14} className="shrink-0 opacity-70" />
          <span>{t("dashboard")}</span>
        </a>

        <a
          href="/posture"
          className={`group flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium transition-all duration-150 animate-fade-in-up ${
            pathname === "/posture"
              ? "bg-accent/12 text-accent shadow-sm shadow-[rgba(50,168,82,0.15)]"
              : "text-secondary/80 hover:text-primary hover:bg-muted/60"
          }`}
          style={{ animationDelay: nextDelay() }}
        >
          <Shield size={14} className="shrink-0 opacity-70" />
          <span>{t("posture")}</span>
        </a>

        {GROUP_ORDER.map((group) => {
          const items = enabled
            .filter((m) => m.nav.group === group)
            .sort((a, b) => a.nav.order - b.nav.order);
          if (items.length === 0) return null;
          return (
            <div key={group} className="space-y-0.5">
              <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-tertiary/50">
                {t(`group.${group}`)}
              </div>
              {items.map((m) => {
                const href = `/${m.slug}`;
                const isActive =
                  pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <a
                    key={m.slug}
                    href={href}
                    className={`group flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] transition-all duration-150 animate-fade-in-up ${
                      isActive
                        ? "bg-accent/12 text-accent font-medium shadow-sm shadow-[rgba(50,168,82,0.15)]"
                        : "text-secondary/70 hover:text-primary hover:bg-muted/60"
                    }`}
                    style={{ animationDelay: nextDelay() }}
                  >
                    <Icon
                      icon={m.icon}
                      size={14}
                      className={`shrink-0 transition-opacity ${
                        isActive
                          ? "opacity-100"
                          : "opacity-50 group-hover:opacity-80"
                      }`}
                    />
                    <span className="flex-1 leading-none">
                      {m.title[locale]}
                    </span>
                    <BadgeFor slug={m.slug} />
                  </a>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border-default/40 px-4 py-3">
        <span className="text-[10px] text-tertiary/30 font-mono">
          v{packageJson.version}
        </span>
      </div>
    </aside>
  );
}
