"use client";

import { useTranslations, useLocale } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format/intl";

export function PendingInvitesPanel() {
  const t = useTranslations("members");
  const locale = useLocale() as "zh" | "en";
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.members.listInvites.useQuery();
  const revoke = trpc.members.revokeInvite.useMutation({
    onSuccess: () => utils.members.listInvites.invalidate(),
  });

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-secondary">
        {t("pending.title")}
      </h2>
      <div className="w-full overflow-x-auto rounded-xl border border-border-default/30 bg-surface/40 backdrop-blur-md shadow-md">
        <table className="w-full border-collapse text-body text-left">
          <thead className="bg-muted/40 border-b border-border-default/40 backdrop-blur-md">
            <tr>
              <th className="h-10 px-4 align-middle text-xs font-semibold uppercase tracking-wider text-secondary whitespace-nowrap">
                {t("pending.col.email")}
              </th>
              <th className="h-10 px-4 align-middle text-xs font-semibold uppercase tracking-wider text-secondary whitespace-nowrap">
                {t("pending.col.role")}
              </th>
              <th className="h-10 px-4 align-middle text-xs font-semibold uppercase tracking-wider text-secondary whitespace-nowrap">
                {t("pending.col.expires")}
              </th>
              <th className="h-10 px-4 align-middle text-xs font-semibold uppercase tracking-wider text-secondary whitespace-nowrap text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default/20">
            {data.map((inv) => (
              <tr
                key={inv.id}
                className="h-12 border-b border-border-default/20 transition-all duration-300 ease-out hover:bg-muted/50"
              >
                <td className="px-4 py-3 align-middle">{inv.email}</td>
                <td className="px-4 py-3 align-middle">
                  {t(`role.${inv.role}`)}
                </td>
                <td className="px-4 py-3 align-middle whitespace-nowrap">
                  {formatDate(inv.expiresAt, locale)}
                  {inv.expired && (
                    <Badge variant="warn" size="sm" className="ml-2">
                      {t("pending.expiredBadge")}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate({ id: inv.id })}
                  >
                    {t("pending.revoke")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
