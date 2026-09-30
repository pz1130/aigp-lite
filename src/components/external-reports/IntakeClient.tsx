"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";

export function IntakeClient() {
  const t = useTranslations("externalReports");
  const utils = trpc.useUtils();
  const { data: usecases, isLoading } = trpc.inventory.list.useQuery();

  const setIntake = trpc.externalReports.setPublicIntake.useMutation({
    onSuccess: () => utils.inventory.list.invalidate(),
  });

  if (isLoading || !usecases)
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2">{t("intake.system")}</th>
          <th>{t("intake.status")}</th>
          <th>{t("intake.url")}</th>
          <th>{t("intake.actions")}</th>
        </tr>
      </thead>
      <tbody>
        {usecases.map((u) => (
          <tr key={u.id} className="border-b">
            <td className="py-2">{u.name}</td>
            <td>
              {u.publicReportEnabled
                ? t("intake.enabled")
                : t("intake.disabled")}
            </td>
            <td className="max-w-xs truncate">
              {u.publicReportEnabled && u.publicReportToken
                ? `${origin}/r/${u.publicReportToken}`
                : "—"}
            </td>
            <td className="space-x-2">
              {u.publicReportEnabled ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setIntake.mutate({
                        usecaseId: u.id,
                        enabled: true,
                        rotate: true,
                      })
                    }
                    className="rounded-md border px-2 py-1"
                  >
                    {t("intake.rotate")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setIntake.mutate({ usecaseId: u.id, enabled: false })
                    }
                    className="rounded-md border px-2 py-1"
                  >
                    {t("intake.disable")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setIntake.mutate({ usecaseId: u.id, enabled: true })
                  }
                  className="rounded-md border px-2 py-1"
                >
                  {t("intake.enable")}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
