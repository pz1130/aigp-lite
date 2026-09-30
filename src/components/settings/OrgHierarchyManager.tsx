"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function OrgHierarchyManager() {
  const t = useTranslations("hierarchy");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.orgHierarchy.listChildren.useQuery();
  const attach = trpc.orgHierarchy.attachChild.useMutation({
    onSuccess: () => utils.orgHierarchy.listChildren.invalidate(),
  });
  const detach = trpc.orgHierarchy.detachChild.useMutation({
    onSuccess: () => utils.orgHierarchy.listChildren.invalidate(),
  });
  const [childOrgId, setChildOrgId] = useState("");

  if (isLoading)
    return <div className="text-sm text-secondary py-4">{t("loading")}</div>;
  if (!data) return null;

  // A child org does not manage hierarchy.
  if (data.parentOrgId) {
    return <p className="text-sm text-warn">{t("isChildNotice")}</p>;
  }

  function handleAttach(e: React.FormEvent) {
    e.preventDefault();
    const id = childOrgId.trim();
    if (!id) return;
    attach.mutate({ childOrgId: id }, { onSuccess: () => setChildOrgId("") });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-secondary">{t("standaloneNotice")}</p>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-primary">
          {t("childrenHeading")}
        </h2>
        {data.children.length === 0 ? (
          <p className="text-sm text-secondary">{t("noChildren")}</p>
        ) : (
          <ul className="divide-y divide-border-default rounded-md border border-border-default">
            {data.children.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between px-3 py-2"
              >
                <div>
                  <div className="text-sm text-primary">{c.name}</div>
                  <div className="font-mono text-xs text-secondary">{c.id}</div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={detach.isPending}
                  onClick={() => detach.mutate({ childOrgId: c.id })}
                >
                  {t("detach")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-primary">
          {t("attachHeading")}
        </h2>
        <p className="text-xs text-secondary">{t("attachHint")}</p>
        <form onSubmit={handleAttach} className="flex items-center gap-2">
          <Input
            placeholder={t("childOrgIdPlaceholder")}
            value={childOrgId}
            onChange={(e) => setChildOrgId(e.target.value)}
          />
          <Button type="submit" disabled={attach.isPending}>
            {t("attach")}
          </Button>
        </form>
        {attach.isSuccess && (
          <p className="text-sm text-success">{t("attached")}</p>
        )}
        {attach.isError && (
          <p className="text-sm text-danger">{t("attachError")}</p>
        )}
        {detach.isSuccess && (
          <p className="text-sm text-success">{t("detached")}</p>
        )}
      </section>
    </div>
  );
}
