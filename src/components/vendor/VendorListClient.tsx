"use client";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function VendorListClient() {
  const t = useTranslations("vendor");
  const { data, isLoading } = trpc.vendor.list.useQuery();
  if (isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  const rows = data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/vendors/new">
          <Button>{t("new")}</Button>
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">{t("name")}</th>
              <th>{t("typeLabel")}</th>
              <th>{t("ratingLabel")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const eff = v.ratingOverride ?? v.computedRating;
              return (
                <tr key={v.id} className="border-b hover:bg-muted/40">
                  <td className="py-2">
                    <Link className="underline" href={`/vendors/${v.id}`}>
                      {v.name}
                    </Link>
                  </td>
                  <td>{t(`type.${v.vendorType}`)}</td>
                  <td>{eff ? t(`rating.${eff}`) : t("unassessed")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
