"use client";
import { Link, usePathname } from "@/i18n/routing";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/components/ui/_utils/cn";
import { type ReactNode } from "react";

interface SidebarLinkProps {
  href: string;
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  label: string;
  badge?: ReactNode;
}

export function SidebarLink({ href, icon, label, badge }: SidebarLinkProps) {
  const path = usePathname();
  const isActive = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "relative flex h-9 items-center gap-2 rounded-md px-3 text-body",
        isActive
          ? "bg-accent-subtle text-accent"
          : "text-secondary hover:bg-muted",
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 h-6 w-0.5 rounded-r bg-accent" />
      )}
      <Icon icon={icon} size={16} />
      <span className="flex-1">{label}</span>
      {badge}
    </Link>
  );
}
