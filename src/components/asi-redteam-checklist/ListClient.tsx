"use client";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function AsiChkListClient() {
  const t = useTranslations("asiRedteamChecklist");
  const { data, isLoading } = trpc.asiRedteamChecklist.list.useQuery();

  if (isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/asi-redteam-checklist/new">
          <Button>{t("new")}</Button>
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">{t("fieldTitle")}</th>
              <th>{t("scope")}</th>
              <th>{t("status")}</th>
              <th>v</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b hover:bg-muted/40">
                <td className="py-2">
                  <Link
                    className="underline"
                    href={`/asi-redteam-checklist/${a.id}`}
                  >
                    {a.title}
                  </Link>
                </td>
                <td>
                  {a.usecase
                    ? `${t("scopeUsecase")}: ${a.usecase.name}`
                    : t("scopeOrg")}
                </td>
                <td>{a.status}</td>
                <td>{a.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
