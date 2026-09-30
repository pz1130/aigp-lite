"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";

export function QueueClient() {
  const t = useTranslations("externalReports");
  const [status, setStatus] = useState<string>("");
  const [type, setType] = useState<string>("");

  const { data, isLoading } = trpc.externalReports.list.useQuery({
    status: status || undefined,
    type: (type || undefined) as
      "vulnerability" | "usage_violation" | undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border p-2 text-sm"
        >
          <option value="">{t("filter.allTypes")}</option>
          <option value="vulnerability">{t("public.typeVulnerability")}</option>
          <option value="usage_violation">
            {t("public.typeUsageViolation")}
          </option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border p-2 text-sm"
        >
          <option value="">{t("filter.allStatuses")}</option>
          {[
            "received",
            "triaging",
            "accepted",
            "resolved",
            "rejected",
            "duplicate",
          ].map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        <Link
          href="/external-reports/intake"
          className="ml-auto text-sm underline"
        >
          {t("intake.manageLink")}
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">{t("col.title")}</th>
              <th>{t("col.type")}</th>
              <th>{t("col.status")}</th>
              <th>{t("col.received")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2">
                  <Link
                    href={`/external-reports/${r.id}`}
                    className="underline"
                  >
                    {r.title}
                  </Link>
                </td>
                <td>
                  {t(
                    `public.type${r.type === "vulnerability" ? "Vulnerability" : "UsageViolation"}`,
                  )}
                </td>
                <td>{t(`status.${r.status}`)}</td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
