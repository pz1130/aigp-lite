"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { switchOrganizationAction } from "./actions";
import type { UserOrganization } from "@/lib/auth/session";

interface OrganizationSwitcherProps {
  organizations: UserOrganization[];
  activeOrgId: string;
  redirectAfterSwitch?: boolean;
}

export function OrganizationSwitcher({
  organizations,
  activeOrgId,
  redirectAfterSwitch = false,
}: OrganizationSwitcherProps) {
  const t = useTranslations("nav.organization");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (organizations.length <= 1) return null;

  function handleChange(orgId: string) {
    setError(false);
    startTransition(async () => {
      try {
        await switchOrganizationAction(orgId);
        if (redirectAfterSwitch) router.push("/");
        else router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="organization-switcher" className="sr-only">
        {t("label")}
      </label>
      <Select
        value={activeOrgId}
        onValueChange={handleChange}
        disabled={pending}
      >
        <SelectTrigger
          id="organization-switcher"
          aria-label={t("label")}
          className="h-8 w-44 border-border-default/60 bg-surface/70 text-[12px]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {organizations.map((organization) => (
            <SelectItem key={organization.id} value={organization.id}>
              {organization.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-[11px] text-danger">{t("error")}</span>}
    </div>
  );
}
