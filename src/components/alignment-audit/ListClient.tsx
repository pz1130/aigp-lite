"use client";

import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { OutcomeBadge } from "./OutcomeBadge";

export function ListClient() {
  const t = useTranslations("alignmentAudit");
  const { data: audits, isLoading } = trpc.alignmentAudit.list.useQuery();
  const { data: usecases } = trpc.inventory.list.useQuery();
  const usecaseName = (id: string) =>
    usecases?.find((u) => u.id === id)?.name ?? id;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (!audits || audits.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noAudits")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-default text-left text-secondary">
            <th className="py-2 pr-4">{t("system")}</th>
            <th className="py-2 pr-4">{t("targetModel")}</th>
            <th className="py-2 pr-4">{t("outcome")}</th>
            <th className="py-2 pr-4">{t("worstDimension")}</th>
            <th className="py-2">{t("date")}</th>
          </tr>
        </thead>
        <tbody>
          {audits.map((a) => (
            <tr
              key={a.id}
              className="border-b border-border-default hover:bg-subtle/30"
            >
              <td className="py-2 pr-4">
                <Link
                  href={`/alignment-audit/${a.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {usecaseName(a.usecaseId)}
                </Link>
              </td>
              <td className="py-2 pr-4">
                {a.targetProvider}/{a.targetModel}
              </td>
              <td className="py-2 pr-4">
                <OutcomeBadge status={a.status} outcome={a.outcome} />
              </td>
              <td className="py-2 pr-4">
                {a.worstDimension?.replace(/_/g, " ") ?? "—"}
              </td>
              <td className="py-2">
                {new Date(a.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
