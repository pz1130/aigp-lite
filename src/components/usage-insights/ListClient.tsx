"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function UiListClient({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations("usageInsights");
  const list = trpc.usageInsights.list.useQuery();
  const utils = trpc.useUtils();
  const generate = trpc.usageInsights.generate.useMutation({
    onSuccess: () => utils.usageInsights.list.invalidate(),
  });

  const rows = list.data ?? [];

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button
            onClick={() => generate.mutate({})}
            disabled={generate.isPending}
          >
            {generate.isPending ? t("generating") : t("generate")}
          </Button>
        </div>
      )}
      {generate.error && (
        <p className="text-sm text-red-600">{generate.error.message}</p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">{t("version")}</th>
              <th className="py-2">{t("window")}</th>
              <th className="py-2">{t("totalInvocations")}</th>
              <th className="py-2">{t("status")}</th>
              <th className="py-2">{t("generated")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/40">
                <td className="py-2">
                  <Link className="underline" href={`/usage-insights/${r.id}`}>
                    v{r.version}
                  </Link>
                </td>
                <td>
                  {r.windowStart.toISOString().slice(0, 10)} →{" "}
                  {r.windowEnd.toISOString().slice(0, 10)}
                </td>
                <td>{r.totalInvocations}</td>
                <td>{statusLabel(r.status)}</td>
                <td>{r.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  function statusLabel(s: string): string {
    if (s === "published") return t("published");
    if (s === "superseded") return t("superseded");
    return t("draft");
  }
}
