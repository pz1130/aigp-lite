"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function TxrListClient() {
  const t = useTranslations("transparencyReport");
  const list = trpc.transparencyReport.list.useQuery({ scope: "all" });

  return (
    <div className="space-y-4">
      <Link href="/transparency-report/new">
        <Button>{t("new")}</Button>
      </Link>
      {(list.data ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      <ul className="divide-y rounded border">
        {(list.data ?? []).map((r) => (
          <li key={r.id} className="p-3">
            <Link
              href={`/transparency-report/${r.id}`}
              className="font-medium hover:underline"
            >
              {r.title}
            </Link>
            <div className="text-xs text-muted-foreground">
              {r.periodLabel} · {r.usecase ? r.usecase.name : t("scopeOrg")} · v
              {r.version} · {t(`status_${r.status}`)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
