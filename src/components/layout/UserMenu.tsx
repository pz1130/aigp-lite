"use client";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { LocaleSwitch } from "./LocaleSwitch";
import { logoutAction } from "./actions";
import { LogOut, ChevronDown } from "lucide-react";

interface UserMenuProps {
  email: string;
  role: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-accent/12 text-accent",
  risk_officer: "bg-warn/12 text-warn",
  ai_owner: "bg-success/12 text-success",
  auditor: "bg-muted text-secondary",
  viewer: "bg-muted text-tertiary",
};

export function UserMenu({ email, role }: UserMenuProps) {
  const t = useTranslations("nav");
  const initial = email.charAt(0).toUpperCase();
  const colorClass = ROLE_COLORS[role] ?? "bg-muted text-tertiary";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="inline-flex items-center gap-1.5 px-1.5 py-1 h-auto"
        >
          <Avatar className="w-7 h-7">
            <AvatarFallback className="text-[11px] font-semibold">
              {initial}
            </AvatarFallback>
          </Avatar>
          <ChevronDown size={12} className="text-tertiary/60 mr-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
        {/* User info */}
        <div className="px-4 py-3.5 border-b border-border-default/40">
          <div className="text-[13px] font-medium text-primary">{email}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded-full ${colorClass}`}
            >
              {role}
            </span>
          </div>
        </div>

        {/* Menu items */}
        <div className="py-1.5">
          <div className="px-4 py-2">
            <LocaleSwitch />
          </div>
          <div className="h-px bg-border-default/40 mx-3 my-1.5" />
          <form action={logoutAction} className="w-full">
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start gap-2.5 text-[13px] text-secondary hover:text-primary"
            >
              <LogOut size={14} className="opacity-60" />
              {t("logout")}
            </Button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
