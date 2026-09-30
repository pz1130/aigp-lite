"use client";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { FriaStatusBadge } from "./FriaStatusBadge";

export function FriaTab({ usecaseId }: { usecaseId: string }) {
  const t = useTranslations("fria");
  const q = trpc.fria.listForUsecase.useQuery({ usecaseId });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {!q.data?.current && (
          <Link href={`/inventory/${usecaseId}/fria/new`}>
            <Button size="sm">{t("startNew")}</Button>
          </Link>
        )}
      </div>

      {q.isLoading && (
        <div className="text-sm text-tertiary">{t("loading")}</div>
      )}

      {q.data?.current && (
        <Link href={`/inventory/${usecaseId}/fria/${q.data.current.id}`}>
          <div className="rounded-md border border-border-default p-4 hover:bg-subtle/40 cursor-pointer">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">{q.data.current.title}</span>
              <FriaStatusBadge status={q.data.current.status} />
            </div>
            <div className="text-xs text-tertiary">
              v{q.data.current.version} · {t("updatedAt")}:{" "}
              {new Date(q.data.current.updatedAt).toLocaleString()}
            </div>
          </div>
        </Link>
      )}

      {!q.isLoading &&
        !q.data?.current &&
        (q.data?.history.length ?? 0) === 0 && (
          <p className="text-sm text-tertiary">{t("emptyHint")}</p>
        )}

      {(q.data?.history.length ?? 0) > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-secondary">
            {t("history")} ({q.data!.history.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {q.data!.history.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/inventory/${usecaseId}/fria/${h.id}`}
                  className="text-accent hover:underline"
                >
                  v{h.version} · {h.title} ·{" "}
                  {new Date(h.archivedAt ?? h.updatedAt).toLocaleDateString()}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
