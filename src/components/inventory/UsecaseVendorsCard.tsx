"use client";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";

export function UsecaseVendorsCard({ usecaseId }: { usecaseId: string }) {
  const t = useTranslations("vendor");
  const { data, isLoading } = trpc.vendor.list.useQuery();
  if (isLoading) return null;
  const linked = (data ?? []).filter((v) =>
    v.usecases.some((l) => l.usecaseId === usecaseId),
  );

  return (
    <section className="rounded-lg border border-border-default bg-surface p-5">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-primary">
          {t("cardTitle")}
        </h2>
        <p className="text-sm text-secondary">{t("cardDescription")}</p>
      </div>
      {linked.length === 0 ? (
        <p className="text-sm text-tertiary">{t("cardEmpty")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {linked.map((v) => {
            const eff = v.ratingOverride ?? v.computedRating;
            return (
              <li key={v.id} className="flex items-center justify-between">
                <Link className="underline" href={`/vendors/${v.id}`}>
                  {v.name}
                </Link>
                {eff ? (
                  <span className="rounded px-2 py-0.5 text-xs font-medium bg-muted">
                    {t(`rating.${eff}`)}
                  </span>
                ) : (
                  <span className="rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                    {t("cardUnassessedWarning")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
